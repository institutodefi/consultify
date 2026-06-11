import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Plane, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { agendaDb } from '../lib/agendaDb';
import { resumenAnual, DIAS_VACACIONES, TOPE_ANUAL, MESES } from '../lib/jornada';
import CalendarioMes from './agenda/CalendarioMes';
import RelojAnual from './agenda/RelojAnual';
import ModalTarea from './agenda/ModalTarea';

const YEAR = 2026; // año de ajuste

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

function Kpi({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate:  'bg-slate-100 text-slate-600',
    orange: 'bg-amber-100 text-amber-700',
    navy:   'bg-[#061B45]/10 text-[#061B45]',
    sky:    'bg-sky-100 text-sky-700',
    red:    'bg-red-100 text-red-700',
    green:  'bg-emerald-100 text-emerald-700',
  };
  return (
    <Card className="flex items-center gap-3 !p-4">
      <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-xl font-extrabold text-slate-900">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </Card>
  );
}

const r1 = (n) => Math.round(n * 10) / 10;

export default function TabAgenda({ consultores, proyectos }) {
  const [consultorId, setConsultorId] = useState('');
  const [mes, setMes] = useState(new Date().getFullYear() === YEAR ? new Date().getMonth() : 0);
  const [festivos, setFestivos] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [modoVacaciones, setModoVacaciones] = useState(false);
  const [modal, setModal] = useState(null); // {tarea?} | {fecha}
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (consultores.length && !consultorId) setConsultorId(consultores[0].id);
  }, [consultores, consultorId]);

  const recargar = async (cid = consultorId) => {
    if (!cid) return;
    setCargando(true); setError(null);
    try {
      const [f, v, t] = await Promise.all([
        agendaDb.getFestivos(YEAR),
        agendaDb.getVacaciones(cid, YEAR),
        agendaDb.getTareas(cid, YEAR),
      ]);
      setFestivos(f); setVacaciones(v); setTareas(t);
    } catch {
      setError('No se pudo cargar la agenda. Revisa la conexión con Supabase y que la migración SQL esté ejecutada.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { recargar(consultorId); }, [consultorId]); // eslint-disable-line

  const festivosMap = useMemo(() => new Map(festivos.map((f) => [f.fecha, f.nombre])), [festivos]);
  const festivosSet = useMemo(() => new Set(festivos.map((f) => f.fecha)), [festivos]);
  const vacacionesSet = useMemo(() => new Set(vacaciones.map((v) => v.fecha)), [vacaciones]);

  const anual = useMemo(
    () => resumenAnual(YEAR, festivosSet, vacacionesSet, tareas),
    [festivosSet, vacacionesSet, tareas],
  );
  const rMes = anual.meses[mes];

  const dataGrafico = anual.meses.map((m) => ({
    nombre: m.nombre.slice(0, 3),
    Objetivo: Math.round(m.objetivo),
    Previstas: r1(m.previstas),
    Reales: r1(m.reales),
  }));

  const vacacionesRestantes = DIAS_VACACIONES - anual.total.diasVacaciones;
  const desvMes = r1(rMes.reales - rMes.previstas);

  // ── acciones ────────────────────────────────────────────────────
  const toggleVacacion = async (iso) => {
    try {
      const añadida = await agendaDb.toggleVacacion(consultorId, iso);
      setVacaciones((v) => añadida
        ? [...v, { id: `tmp-${iso}`, consultor_id: consultorId, fecha: iso }]
        : v.filter((x) => x.fecha !== iso));
    } catch { setError('No se pudo guardar el día de vacaciones.'); }
  };

  const guardarTarea = async (datos, id) => {
    try {
      if (id) {
        const t = await agendaDb.actualizarTarea(id, datos);
        // si se reasignó a otro responsable, sale de esta agenda
        setTareas((ts) => t.consultor_id === consultorId
          ? ts.map((x) => (x.id === id ? t : x))
          : ts.filter((x) => x.id !== id));
      } else {
        const t = await agendaDb.crearTarea(datos);
        if (t.consultor_id === consultorId) setTareas((ts) => [...ts, t]);
      }
      setModal(null);
    } catch { setError('No se pudo guardar la tarea.'); }
  };

  const borrarTarea = async (id) => {
    try {
      await agendaDb.borrarTarea(id);
      setTareas((ts) => ts.filter((x) => x.id !== id));
      setModal(null);
    } catch { setError('No se pudo eliminar la tarea.'); }
  };

  const consultor = consultores.find((c) => c.id === consultorId);

  return (
    <div className="space-y-5">
      {/* selector + modo vacaciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700">Consultor:</label>
          <select value={consultorId} onChange={(e) => setConsultorId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus:border-[#061B45] focus:outline-none">
            {consultores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} {c.nivel ? `(${c.nivel})` : ''}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setModoVacaciones((m) => !m)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            modoVacaciones
              ? 'border-sky-500 bg-sky-500 text-white'
              : 'border-slate-300 text-slate-600 hover:border-sky-400'
          }`}>
          <Plane size={16} />
          {modoVacaciones ? 'Marcando vacaciones — clic en los días' : 'Marcar vacaciones'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* KPIs del mes seleccionado */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={CalendarDays} label={`Objetivo ${MESES[mes]}`}
          value={`${Math.round(rMes.objetivo)} h`}
          sub={`${rMes.laborables} laborables${mes === 7 ? ' · intensiva 36h/sem' : ''}`} tone="navy" />
        <Kpi icon={Clock} label="Previstas (mes)"
          value={`${r1(rMes.previstas)} h`}
          sub={rMes.previstas > rMes.objetivo ? 'Por encima del objetivo' : undefined}
          tone={rMes.previstas > rMes.objetivo ? 'red' : 'orange'} />
        <Kpi icon={Activity} label="Reales (mes)"
          value={`${r1(rMes.reales)} h`}
          sub={rMes.reales > 0 ? `Desviación ${desvMes > 0 ? '+' : ''}${desvMes} h vs plan` : 'Sin horas imputadas'}
          tone={desvMes > 0 ? 'red' : 'navy'} />
        <Kpi icon={CheckCircle2} label="Disponibles (mes)"
          value={`${r1(rMes.disponibles)} h`} tone="green" />
        <Kpi icon={Plane} label="Vacaciones"
          value={`${anual.total.diasVacaciones} / ${DIAS_VACACIONES} días`}
          sub={vacacionesRestantes >= 0 ? `Quedan ${vacacionesRestantes}` : `Exceso de ${-vacacionesRestantes} días`}
          tone={vacacionesRestantes < 0 ? 'red' : 'sky'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* calendario */}
        <Card className="lg:col-span-2">
          {cargando ? (
            <p className="py-10 text-center text-sm text-slate-400">Cargando agenda…</p>
          ) : (
            <CalendarioMes
              year={YEAR} mes={mes} onCambiarMes={(d) => setMes((m) => Math.min(11, Math.max(0, m + d)))}
              festivos={festivosMap} vacacionesSet={vacacionesSet} tareas={tareas}
              modoVacaciones={modoVacaciones}
              onToggleVacacion={toggleVacacion}
              onNuevaTarea={(fecha) => setModal({ fecha })}
              onEditarTarea={(tarea) => setModal({ tarea })}
            />
          )}
        </Card>

        {/* reloj anual */}
        <Card>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Reloj anual · {consultor?.nombre ?? ''} {YEAR}
          </h3>
          <RelojAnual
            previstas={anual.total.previstas}
            reales={anual.total.reales}
            proyeccion={anual.proyeccion}
            ritmo={anual.ritmo}
          />
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>Horas de convenio {YEAR} (tras festivos): <b>{Math.round(anual.total.horasConvenio)} h</b></p>
            <p>Objetivo tras vacaciones: <b>{Math.round(anual.total.objetivo)} h</b> (tope legal {TOPE_ANUAL} h)</p>
            <p>Desviación anual real vs plan: <b>{r1(anual.total.reales - anual.total.previstas)} h</b></p>
            {anual.excesoSobreTope > 0 && (
              <p className="font-semibold text-red-600">
                ⚠ El calendario supera el tope en {Math.round(anual.excesoSobreTope)} h: añade días de libre disposición o ajusta festivos.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* gráfico anual */}
      <Card>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Horas por mes: objetivo de convenio vs. previstas vs. reales
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataGrafico} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={TOPE_ANUAL / 12} stroke="#DC2626" strokeDasharray="4 4"
                label={{ value: 'Media 150h', fontSize: 10, fill: '#DC2626', position: 'right' }} />
              <Bar dataKey="Objetivo" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Previstas" fill="#F5A623" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Reales" fill="#061B45" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {modal && (
        <ModalTarea
          tarea={modal.tarea} fecha={modal.fecha ?? modal.tarea?.fecha_prevista}
          consultorId={consultorId} consultores={consultores}
          proyectos={proyectos} tareasDelDia={tareas}
          onGuardar={guardarTarea} onBorrar={borrarTarea} onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}
