import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { listTable } from '../../lib/data.js';
import { NORMA_BY_ID, fmtEUR, calcular } from '../../lib/calcEngine.js';

const NAVY = '#0A2A6C', ORANGE = '#F5A623';
const PIE_COLORS = ['#0A2A6C', '#2B4A93', '#4C6BB4', '#7E97CE', '#F5A623'];

export default function Dashboard() {
  const [consultores, setConsultores] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([listTable('consultores'), listTable('proyectos'), listTable('clientes')])
      .then(([c, p, cl]) => { setConsultores(c); setProyectos(p); setClientes(cl); setReady(true); })
      .catch(() => setReady(true));
  }, []);

  const activos = useMemo(() => proyectos.filter(p => p.estado !== 'cerrado'), [proyectos]);

  const kpis = useMemo(() => {
    const mrr = activos.reduce((s, p) => s + (p.precio_mes || 0), 0);
    const bolsas = activos.reduce((s, p) => s + (p.precio_total || 0), 0);
    return { mrr, arr: mrr * 12, bolsas, nProyectos: activos.length, nClientes: clientes.length };
  }, [activos, clientes]);

  const porModelo = useMemo(() => {
    const m = {};
    for (const p of activos) m[p.modelo] = (m[p.modelo] || 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [activos]);

  const porNorma = useMemo(() => {
    const m = {};
    for (const p of activos) for (const n of (p.normas || [])) m[n] = (m[n] || 0) + 1;
    return Object.entries(m).map(([id, n]) => ({ name: NORMA_BY_ID[id]?.nombre || id, proyectos: n }))
      .sort((a, b) => b.proyectos - a.proyectos);
  }, [activos]);

  const carga = useMemo(() => consultores.filter(c => c.activo).map(c => {
    const asignados = activos.filter(p => p.consultor_id === c.id);
    const horas = asignados.reduce((s, p) => {
      if (p.modelo === 'Apoyo') return s;
      const r = calcular(p.normas || [], p.modelo);
      return s + (r?.hTotal || 0);
    }, 0);
    return { ...c, nProyectos: asignados.length, horas, pct: c.capacidad_clientes ? Math.min(100, Math.round(asignados.length / c.capacidad_clientes * 100)) : 0 };
  }), [consultores, activos]);

  if (!ready) return <p className="font-semibold text-navy-400">Cargando…</p>;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="MRR (cuotas activas)" value={fmtEUR(kpis.mrr)} sub={`ARR ${fmtEUR(kpis.arr)}`} />
        <Kpi label="Bolsas Apoyo vendidas" value={fmtEUR(kpis.bolsas)} sub="pago único" />
        <Kpi label="Proyectos en cartera" value={kpis.nProyectos} sub={`${kpis.nClientes} clientes`} />
        <Kpi label="Objetivo 2027" value="3 M€" sub={`MRR necesario ≈ ${fmtEUR(250000)}`} accent />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-extrabold">Proyectos por norma</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={porNorma} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="proyectos" fill={NAVY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3 className="font-extrabold">Mix por modelo</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={porModelo} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} label={({ name, value }) => `${name} (${value})`}>
                  {porModelo.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs font-medium text-navy-400">Objetivo de mezcla: 80 % Relación · 20 % Implicación.</p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-extrabold">Carga del equipo</h3>
        <div className="mt-4 space-y-4">
          {carga.map(c => (
            <div key={c.id}>
              <div className="flex items-baseline justify-between text-sm">
                <p className="font-bold">{c.nombre} <span className="chip ml-1 bg-navy-50 text-navy-500">{c.nivel}</span></p>
                <p className="font-semibold text-navy-400">{c.nProyectos}/{c.capacidad_clientes} clientes · ~{c.horas} h/mes</p>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-navy-50">
                <div className="h-2.5 rounded-full transition-all" style={{ width: `${c.pct}%`, background: c.pct > 90 ? '#DC2626' : c.pct > 70 ? ORANGE : NAVY }} />
              </div>
            </div>
          ))}
          {!carga.length && <p className="text-sm font-medium text-navy-400">Sin consultores activos. Añádelos en la pestaña Equipo.</p>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`card ${accent ? '!bg-navy-900 !border-navy-900 text-white' : ''}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${accent ? 'text-brand-orange' : 'text-navy-300'}`}>{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className={`mt-0.5 text-xs font-semibold ${accent ? 'text-white/60' : 'text-navy-400'}`}>{sub}</p>}
    </div>
  );
}
