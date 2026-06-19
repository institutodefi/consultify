import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { listTable } from '../../lib/data.js';
import { supabase } from '../../lib/supabase.js';
import { NORMA_BY_ID, fmtEUR, calcular } from '../../lib/calcEngine.js';
import { useAuth } from '../../lib/auth.jsx';

const NAVY = '#0A2A6C', ORANGE = '#F5A623';
const PIE_COLORS = ['#0A2A6C', '#2B4A93', '#4C6BB4', '#7E97CE', '#F5A623'];

export default function Dashboard() {
  const { verEconomico } = useAuth();
  const [consultores, setConsultores] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [ready, setReady] = useState(false);

  const cargar = () => {
    listTable('consultores').then(setConsultores).catch(() => setConsultores([]));
    listTable('proyectos_cliente').then(setProyectos).catch(() => setProyectos([]));
    listTable('clientes').then(setClientes).catch(() => setClientes([]));
    listTable('cliente_tareas').then(setTareas).catch(() => setTareas([]));
    setReady(true);
  };
  useEffect(cargar, []);

  // Realtime: refresca el dashboard cuando cambian los proyectos (si está disponible).
  useEffect(() => {
    if (!supabase) return;
    try {
      const canal = supabase
        .channel('dash-proyectos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_cliente' }, cargar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_tareas' }, cargar)
        .subscribe();
      return () => { try { supabase.removeChannel(canal); } catch { /* noop */ } };
    } catch { /* realtime no disponible */ }
  }, []);

  const activos = useMemo(() => proyectos.filter(p => p.estado !== 'cerrado'), [proyectos]);

  // KPIs recalculados desde normas+modelo de cada proyecto (proyectos_cliente
  // no guarda precio; lo derivamos del motor de cálculo).
  const kpis = useMemo(() => {
    let mrr = 0, bolsas = 0;
    for (const p of activos) {
      const r = calcular(p.normas || [], p.modelo);
      if (!r) continue;
      if (r.tipo === 'mes') mrr += r.precioCatalogo || 0;
      else bolsas += r.precioCatalogo || 0;
    }
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

  const equipoConsultores = useMemo(() => consultores.filter(c => c.activo && (c.tipo_equipo || 'consultor') === 'consultor'), [consultores]);
  const equipoComercial = useMemo(() => consultores.filter(c => c.activo && c.tipo_equipo === 'gestion' && c.subtipo === 'comercial'), [consultores]);
  const equipoGestion = useMemo(() => consultores.filter(c => c.activo && c.tipo_equipo === 'gestion'), [consultores]);

  const carga = useMemo(() => equipoConsultores.map(c => {
    // Carga real: horas de las tareas de proyecto asignadas a este consultor.
    const suyas = tareas.filter(t => String(t.consultor_id) === String(c.id));
    const horas = suyas.reduce((s, t) => s + (Number(t.horas) || 0), 0);
    const proyectosIds = new Set(suyas.map(t => t.proyecto_id).filter(Boolean));
    const capProd = Math.round(150 * (c.pct_jornada ?? 100) / 100 * 0.7);
    return { ...c, nProyectos: proyectosIds.size, horas, capProd, pct: capProd ? Math.min(100, Math.round(horas / capProd * 100)) : 0 };
  }), [equipoConsultores, tareas]);

  // Selección flexible de qué consultores se ven en la carga.
  const [equipoCargaSel, setEquipoCargaSel] = useState(null);
  useEffect(() => {
    if (equipoCargaSel === null && equipoConsultores.length) {
      setEquipoCargaSel(new Set(equipoConsultores.map(c => String(c.id))));
    }
  }, [equipoConsultores, equipoCargaSel]);
  const cargaVisible = useMemo(() => {
    if (!equipoCargaSel) return carga;
    return carga.filter(c => equipoCargaSel.has(String(c.id)));
  }, [carga, equipoCargaSel]);

  if (!ready) return <p className="font-semibold text-navy-400">Cargando…</p>;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {verEconomico ? (
          <>
            <Kpi label="MRR (cuotas activas)" value={fmtEUR(kpis.mrr)} sub={`ARR ${fmtEUR(kpis.arr)}`} />
            <Kpi label="Bolsas Apoyo vendidas" value={fmtEUR(kpis.bolsas)} sub="pago único" />
            <Kpi label="Proyectos en cartera" value={kpis.nProyectos} sub={`${kpis.nClientes} clientes`} />
            <Kpi label="Objetivo 2027" value="3 M€" sub={`MRR necesario ≈ ${fmtEUR(250000)}`} accent />
          </>
        ) : (
          <>
            <Kpi label="Proyectos en cartera" value={kpis.nProyectos} sub={`${kpis.nClientes} clientes`} />
            <Kpi label="Consultores activos" value={equipoConsultores.length} sub="equipo de entrega" />
            <Kpi label="Equipo de gestión" value={equipoGestion.length} sub={`${equipoComercial.length} comercial(es)`} />
            <Kpi label="Sistemas activos" value={porNorma.length} sub="normas en cartera" accent />
          </>
        )}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-extrabold">Equipo de consultoría <span className="chip ml-1 bg-navy-50 text-navy-500">{equipoConsultores.length}</span></h3>
          <div className="mt-3 space-y-2">
            {equipoConsultores.map(c => (
              <div key={c.id} className="flex items-center justify-between border-b border-navy-50 pb-2 text-sm last:border-0">
                <span className="font-bold">{c.nombre} {c.apellidos || ''}</span>
                <span className="chip bg-navy-50 text-navy-600">{c.nivel} · {c.pct_jornada ?? 100}%</span>
              </div>
            ))}
            {!equipoConsultores.length && <p className="text-sm font-medium text-navy-400">Sin consultores. Añádelos en Equipo.</p>}
          </div>
        </div>
        <div className="card">
          <h3 className="font-extrabold">Equipo de gestión <span className="chip ml-1 bg-navy-50 text-navy-500">{equipoGestion.length}</span></h3>
          <div className="mt-3 space-y-2">
            {equipoGestion.map(c => (
              <div key={c.id} className="flex items-center justify-between border-b border-navy-50 pb-2 text-sm last:border-0">
                <span className="font-bold">{c.nombre} {c.apellidos || ''}</span>
                <span className="chip bg-brand-orange/15 text-brand-orangeDark capitalize">{c.subtipo || 'gestión'}</span>
              </div>
            ))}
            {!equipoGestion.length && <p className="text-sm font-medium text-navy-400">Sin equipo de gestión. Añádelo en Equipo.</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold">Carga del equipo de consultoría</h3>
          <div className="flex gap-2">
            <button onClick={() => setEquipoCargaSel(new Set(equipoConsultores.map(c => String(c.id))))} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">Todos</button>
            <button onClick={() => setEquipoCargaSel(new Set())} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">Ninguno</button>
          </div>
        </div>
        <p className="mt-1 text-xs font-medium text-navy-400">Marca los consultores que quieres incluir en la vista de carga.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {equipoConsultores.map(c => {
            const on = equipoCargaSel ? equipoCargaSel.has(String(c.id)) : true;
            return (
              <button key={c.id} onClick={() => setEquipoCargaSel(s => { const n = new Set(s); n.has(String(c.id)) ? n.delete(String(c.id)) : n.add(String(c.id)); return n; })}
                className={`chip border text-xs font-bold ${on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400'}`}>
                {on ? '✓ ' : ''}{c.nombre}
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-4">
          {cargaVisible.map(c => (
            <div key={c.id}>
              <div className="flex items-baseline justify-between text-sm">
                <p className="font-bold">{c.nombre} <span className="chip ml-1 bg-navy-50 text-navy-500">{c.nivel}</span></p>
                <p className="font-semibold text-navy-400">{c.nProyectos} proyectos · ~{c.horas}/{c.capProd} h productivas/mes</p>
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
