import { useMemo } from 'react';
import { Briefcase, Euro, Clock, Gauge } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { NORMA_BY_ID, COLORES_MODELO, NOMBRES_MODELOS } from '../lib/catalogo';
import { horasProduccionMes } from '../lib/supabase';
import { eur } from '../lib/calculadora';

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

function Kpi({ icon: Icon, label, value, sub, tone = 'navy' }) {
  const tones = {
    navy: 'bg-navy/10 text-navy',
    orange: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <Card className="flex items-center gap-3 !p-4">
      <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-xl font-extrabold">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </Card>
  );
}

export default function TabDashboard({ consultores, proyectos }) {
  const activos = proyectos.filter((p) => p.estado === 'activo');

  const { mrr, horasAsignadas, capacidadTotal, porModelo, topNormas, carga } = useMemo(() => {
    const mrr = activos
      .filter((p) => p.modelo !== 'Apoyo')
      .reduce((s, p) => s + Number(p.precio_mes || 0), 0);
    const horasAsignadas = activos.reduce((s, p) => s + Number(p.h_total_mes || 0), 0);
    const capacidadTotal = consultores.reduce((s, c) => s + horasProduccionMes(Number(c.horas_sem || 35)), 0);

    const porModelo = NOMBRES_MODELOS
      .map((m) => ({ name: m, value: activos.filter((p) => p.modelo === m).length }))
      .filter((x) => x.value > 0);

    const cuenta = {};
    for (const p of activos) for (const n of p.normas ?? []) cuenta[n] = (cuenta[n] || 0) + 1;
    const topNormas = Object.entries(cuenta)
      .map(([id, v]) => ({ nombre: NORMA_BY_ID[id]?.nombre ?? id, Proyectos: v }))
      .sort((a, b) => b.Proyectos - a.Proyectos)
      .slice(0, 6);

    const carga = consultores.map((c) => {
      const cap = horasProduccionMes(Number(c.horas_sem || 35));
      const asignadas = activos
        .filter((p) => p.consultor_id === c.id)
        .reduce((s, p) => s + Number(p.h_total_mes || 0), 0);
      return { ...c, cap, asignadas, pct: cap > 0 ? Math.round((asignadas / cap) * 100) : 0 };
    });

    return { mrr, horasAsignadas, capacidadTotal, porModelo, topNormas, carga };
  }, [activos, consultores]);

  const ocupacion = capacidadTotal > 0 ? Math.round((horasAsignadas / capacidadTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Briefcase} label="Proyectos activos" value={activos.length} />
        <Kpi icon={Euro} label="MRR (recurrentes)" value={eur(mrr)} tone="orange" />
        <Kpi icon={Clock} label="Horas asignadas/mes" value={`${Math.round(horasAsignadas)} h`}
          sub={`Capacidad equipo: ${capacidadTotal} h`} />
        <Kpi icon={Gauge} label="Ocupación equipo" value={`${ocupacion}%`}
          tone={ocupacion > 100 ? 'red' : ocupacion > 80 ? 'orange' : 'green'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Distribución por modelo */}
        <Card>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Distribución por modelo</h3>
          {porModelo.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Aún no hay proyectos activos. Créalos en la pestaña Proyectos.</p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porModelo} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {porModelo.map((e) => <Cell key={e.name} fill={COLORES_MODELO[e.name]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Top normas */}
        <Card>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Normas más vendidas</h3>
          {topNormas.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sin datos todavía.</p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topNormas} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Proyectos" fill="#F5A623" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Carga por consultor */}
      <Card>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Carga por consultor</h3>
        {carga.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Sin consultores activos. Añádelos en la pestaña Equipo.</p>
        ) : (
          <div className="space-y-3">
            {carga.map((c) => {
              const color = c.pct > 100 ? 'bg-red-500' : c.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
              const texto = c.pct > 100 ? 'text-red-600' : c.pct > 80 ? 'text-amber-600' : 'text-slate-700';
              return (
                <div key={c.id} className="flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <p className="truncate text-sm font-semibold">{c.nombre}</p>
                    <p className="text-[11px] text-slate-400">{c.nivel} · {c.cap} h/mes</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-500">{Math.round(c.asignadas)} h asignadas</span>
                      <span className={`font-bold ${texto}`}>{c.pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(c.pct, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
