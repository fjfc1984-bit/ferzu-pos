// =============================================================================
// FERZU POS — LANDING PAGE v2  |  Premium Dark Design
// Diseño: Dark Glassmorphism + Motion + Bento Grid
// Ruta: / (pública, sin autenticación)
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, BarChart3, Package, Scissors, ChefHat,
  Wrench, Store, CheckCircle2, ArrowRight, Zap, Shield, Wifi,
  Menu, X, FileText, Smartphone, TrendingUp, Globe, Users,
  Star, Clock, Cpu
} from 'lucide-react';

/* ─── ESTILOS GLOBALES ────────────────────────────────────────────────────── */
function GlobalStyles() {
  return (
    <style>{`
      @keyframes float-a {
        0%,100%{transform:translateY(0) rotate(0)}
        33%{transform:translateY(-16px) rotate(.7deg)}
        66%{transform:translateY(-8px) rotate(-.7deg)}
      }
      @keyframes float-b {
        0%,100%{transform:translateY(0) scale(1)}
        50%{transform:translateY(-22px) scale(1.03)}
      }
      @keyframes float-c {
        0%,100%{transform:translateY(0)}
        40%{transform:translateY(-12px)}
        70%{transform:translateY(-6px)}
      }
      @keyframes orb-a {
        0%,100%{opacity:.12;transform:scale(1)}
        50%{opacity:.22;transform:scale(1.18)}
      }
      @keyframes orb-b {
        0%,100%{opacity:.08;transform:scale(1)}
        50%{opacity:.16;transform:scale(1.12)}
      }
      @keyframes shimmer {
        0%{background-position:-250% center}
        100%{background-position:250% center}
      }
      @keyframes ticker {
        0%{transform:translateX(0)}
        100%{transform:translateX(-50%)}
      }
      @keyframes fade-up {
        from{opacity:0;transform:translateY(28px)}
        to{opacity:1;transform:translateY(0)}
      }
      @keyframes ping-ring {
        75%,100%{transform:scale(2);opacity:0}
      }
      @keyframes bar-rise {
        from{transform:scaleY(0);transform-origin:bottom}
        to{transform:scaleY(1);transform-origin:bottom}
      }
      @keyframes spin-slow {
        from{transform:rotate(0deg)}
        to{transform:rotate(360deg)}
      }

      /* Float classes */
      .fa{animation:float-a 7.5s ease-in-out infinite}
      .fb{animation:float-b 9s ease-in-out infinite 1.2s}
      .fc{animation:float-c 8s ease-in-out infinite 2.8s}
      .orb-a{animation:orb-a 6s ease-in-out infinite}
      .orb-b{animation:orb-b 9s ease-in-out infinite 3s}

      /* Text gradients */
      .shimmer-text {
        background:linear-gradient(90deg,#10b981 0%,#6ee7b7 35%,#10b981 65%,#6ee7b7 100%);
        background-size:250% auto;
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
        animation:shimmer 3.5s linear infinite;
      }
      .g-text {
        background:linear-gradient(135deg,#10b981 0%,#34d399 100%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
      }
      .g-text-blue {
        background:linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
      }

      /* Backgrounds */
      .hero-bg {
        background:#020b12;
        background-image:
          radial-gradient(ellipse 80% 70% at 0% 5%,rgba(16,185,129,.14) 0%,transparent 60%),
          radial-gradient(ellipse 60% 60% at 100% 95%,rgba(5,150,105,.11) 0%,transparent 55%),
          radial-gradient(ellipse 50% 50% at 55% 45%,rgba(6,78,59,.06) 0%,transparent 70%);
      }
      .section-bg{background:#030c15}
      .alt-bg{background:#04101a}
      .deep-bg{background:#020b12}

      /* Glass effects */
      .glass {
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.09);
        backdrop-filter:blur(16px);
        -webkit-backdrop-filter:blur(16px);
      }
      .glass-sm {
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
      }
      .dark-card {
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.07);
      }

      /* Glows */
      .glow-e{box-shadow:0 0 28px rgba(16,185,129,.45),0 0 70px rgba(16,185,129,.12)}
      .glow-e-sm{box-shadow:0 0 15px rgba(16,185,129,.35)}
      .glow-ring{box-shadow:0 0 0 1px rgba(16,185,129,.3),0 0 20px rgba(16,185,129,.15)}

      /* Navbar */
      .nav-glass {
        background:rgba(2,11,18,.9);
        backdrop-filter:blur(24px);
        -webkit-backdrop-filter:blur(24px);
        border-bottom:1px solid rgba(255,255,255,.07);
      }

      /* Buttons */
      .btn-p {
        background:linear-gradient(135deg,#10b981 0%,#059669 100%);
        box-shadow:0 0 22px rgba(16,185,129,.5),0 4px 20px rgba(0,0,0,.35);
        transition:all .3s cubic-bezier(.175,.885,.32,1.275);
        color:#fff;font-weight:700;
      }
      .btn-p:hover {
        background:linear-gradient(135deg,#34d399 0%,#10b981 100%);
        box-shadow:0 0 40px rgba(16,185,129,.7),0 8px 35px rgba(0,0,0,.4);
        transform:translateY(-2px) scale(1.02);
      }
      .btn-g {
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.15);
        color:rgba(255,255,255,.7);
        transition:all .3s ease;
      }
      .btn-g:hover {
        border-color:rgba(16,185,129,.5);
        background:rgba(16,185,129,.07);
        box-shadow:0 0 20px rgba(16,185,129,.15);
        color:#fff;
      }

      /* Hover cards */
      .hov {
        transition:transform .35s ease,box-shadow .35s ease,border-color .35s ease;
      }
      .hov:hover {
        transform:translateY(-6px);
        border-color:rgba(16,185,129,.28) !important;
        box-shadow:0 24px 50px rgba(0,0,0,.5),0 0 35px rgba(16,185,129,.1);
      }

      /* Gradient border card */
      .gb {
        position:relative;
        border-radius:18px;
        background:rgba(8,15,28,.85);
      }
      .gb::before {
        content:'';
        position:absolute;
        inset:0;
        border-radius:18px;
        padding:1px;
        background:linear-gradient(135deg,rgba(16,185,129,.4),rgba(6,182,212,.2),rgba(99,102,241,.12));
        -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
        mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
        -webkit-mask-composite:xor;
        mask-composite:exclude;
        pointer-events:none;
      }

      /* Pricing popular */
      .price-hot {
        background:linear-gradient(145deg,rgba(16,185,129,.1),rgba(6,182,212,.05));
        border:1.5px solid rgba(16,185,129,.45);
        box-shadow:0 0 60px rgba(16,185,129,.15),0 30px 70px rgba(0,0,0,.6);
      }

      /* Ticker */
      .ticker-wrap{overflow:hidden;white-space:nowrap;display:block}
      .ticker-inner{display:inline-flex;animation:ticker 32s linear infinite}

      /* Ping */
      .ping-dot{position:relative}
      .ping-dot::before {
        content:'';
        position:absolute;
        inset:-3px;
        border-radius:50%;
        background:rgba(16,185,129,.5);
        animation:ping-ring 1.8s ease-out infinite;
      }

      /* Section tag */
      .s-tag {
        display:inline-flex;align-items:center;gap:6px;
        padding:5px 13px;
        background:rgba(16,185,129,.1);
        border:1px solid rgba(16,185,129,.25);
        border-radius:999px;
        color:#34d399;
        font-size:11px;font-weight:700;letter-spacing:.09em;
        text-transform:uppercase;
      }

      /* Divider */
      .divider{height:1px;background:linear-gradient(90deg,transparent,rgba(16,185,129,.3),transparent)}

      /* Load animations */
      .a1{animation:fade-up .7s .05s both ease-out}
      .a2{animation:fade-up .7s .15s both ease-out}
      .a3{animation:fade-up .7s .25s both ease-out}
      .a4{animation:fade-up .7s .35s both ease-out}
      .a5{animation:fade-up .7s .45s both ease-out}
      .a6{animation:fade-up .7s .55s both ease-out}

      /* Mock screen */
      .mock-screen{background:linear-gradient(145deg,#0c1829,#1a2d44)}

      /* Bar chart animation */
      .bar-anim{animation:bar-rise .9s ease-out forwards}

      /* Orb base */
      .orb{
        position:absolute;
        border-radius:50%;
        filter:blur(80px);
        pointer-events:none;
      }

      /* Spin icon */
      .spin-slow{animation:spin-slow 8s linear infinite}
    `}</style>
  );
}

/* ─── DATOS ───────────────────────────────────────────────────────────────── */

const MODULOS = [
  { icon: ShoppingCart, t: 'Punto de Venta',    d: 'Cobra rápido con múltiples métodos de pago y cambio automático.',            accent:'#10b981', bg:'rgba(16,185,129,.12)',  bd:'rgba(16,185,129,.25)' },
  { icon: Package,      t: 'Inventario',         d: 'Stock en tiempo real, alertas de agotamiento y control de proveedores.',     accent:'#06b6d4', bg:'rgba(6,182,212,.12)',   bd:'rgba(6,182,212,.25)' },
  { icon: Scissors,     t: 'Barbería / Spa',     d: 'Citas, turnos, historial por cliente y comisiones para estilistas.',        accent:'#a855f7', bg:'rgba(168,85,247,.12)',  bd:'rgba(168,85,247,.25)' },
  { icon: ChefHat,      t: 'Cocina KDS',         d: 'Pantalla de cocina en tiempo real. Sin papel ni intermediarios.',           accent:'#f97316', bg:'rgba(249,115,22,.12)',  bd:'rgba(249,115,22,.25)' },
  { icon: Wrench,       t: 'Taller Mecánico',    d: 'Órdenes de trabajo, seguimiento de reparaciones y notificación al cliente.', accent:'#ef4444', bg:'rgba(239,68,68,.12)',   bd:'rgba(239,68,68,.25)' },
  { icon: Store,        t: 'Minimarket',          d: 'Venta por peso, control de vencimientos, código de barras y descuentos.',   accent:'#eab308', bg:'rgba(234,179,8,.12)',   bd:'rgba(234,179,8,.25)' },
  { icon: BarChart3,    t: 'Dashboard IA',        d: 'Reportes automáticos en lenguaje natural. La IA te dice qué está pasando.', accent:'#14b8a6', bg:'rgba(20,184,166,.12)',  bd:'rgba(20,184,166,.25)' },
  { icon: FileText,     t: 'Facturación DIAN',   d: 'Facturas electrónicas UBL 2.1 con firma digital. Add-on opcional.',         accent:'#6366f1', bg:'rgba(99,102,241,.12)', bd:'rgba(99,102,241,.25)' },
];

const PLANES = [
  {
    nombre:'Básico', precio:'$49.000', desc:'Para negocios pequeños que arrancan.',
    items:['POS básico','Hasta 2 usuarios','Inventario simple','Soporte por email'],
    cta:'Empezar gratis', hot:false,
  },
  {
    nombre:'Profesional', precio:'$79.000', desc:'Ideal para barberías, talleres y minimarkets.',
    items:['Todo lo del Básico','Hasta 5 usuarios','Módulo especializado (barbería, taller o minimarket)','Dashboard IA','Soporte prioritario'],
    cta:'Empezar con Profesional', hot:false,
  },
  {
    nombre:'Restaurante', precio:'$89.000', desc:'El favorito de restaurantes y fondas.',
    items:['Todo lo del Básico','Kitchen Display (KDS)','Gestión de mesas','Dashboard IA','Soporte prioritario'],
    cta:'Empezar con Restaurante', hot:true,
  },
  {
    nombre:'Pro', precio:'$149.000', desc:'Para negocios con múltiples sucursales.',
    items:['Todo lo anterior','Usuarios ilimitados','Múltiples sucursales','Facturación DIAN','Soporte 24/7'],
    cta:'Contactar ventas', hot:false,
  },
];

const TICKER_ITEMS = [
  '🍔  Restaurantes','✂️  Barberías','🔧  Talleres','🏪  Minimarkets',
  '🛍️  Tiendas','💆  Spas & Salones','☕  Cafeterías','🎂  Pastelerías',
];

/* ─── MOCK POS UI ─────────────────────────────────────────────────────────── */
function MockPOS() {
  const items = [
    { name:'Hamburguesa Doble', qty:2, price:'$18.500', c:'rgba(249,115,22,.18)', b:'rgba(249,115,22,.35)' },
    { name:'Gaseosa 400ml',     qty:3, price:'$3.500',  c:'rgba(6,182,212,.18)',  b:'rgba(6,182,212,.35)' },
    { name:'Papas Fritas',      qty:1, price:'$7.000',  c:'rgba(234,179,8,.18)',  b:'rgba(234,179,8,.35)' },
  ];
  return (
    <div className="mock-screen rounded-2xl p-5 w-72 shadow-2xl" style={{ border:'1px solid rgba(255,255,255,.1)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center btn-p">
            <ShoppingCart size={13} />
          </div>
          <span className="text-white text-xs font-black tracking-wide">FERZU POS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-2 h-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 ping-dot" />
          </div>
          <span className="text-emerald-400 text-xs font-semibold">EN LÍNEA</span>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-2 mb-4">
        {items.map(it => (
          <div key={it.name} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background:it.c, border:`1px solid ${it.b}` }}>
            <div>
              <p className="text-white text-xs font-semibold leading-tight">{it.name}</p>
              <p style={{ color:'rgba(255,255,255,.4)', fontSize:'11px' }}>×{it.qty}</p>
            </div>
            <span className="text-emerald-300 text-xs font-bold">{it.price}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="glass rounded-xl p-3 mb-3">
        <div className="flex justify-between text-xs mb-1" style={{ color:'rgba(255,255,255,.4)' }}>
          <span>Subtotal</span><span style={{ color:'rgba(255,255,255,.6)' }}>$58.500</span>
        </div>
        <div className="flex justify-between text-xs mb-2">
          <span style={{ color:'rgba(255,255,255,.4)' }}>Descuento</span>
          <span className="text-emerald-400 font-semibold">-$8.000</span>
        </div>
        <div style={{ height:'1px', background:'rgba(255,255,255,.08)', margin:'8px 0' }} />
        <div className="flex justify-between items-baseline">
          <span className="text-white font-bold text-sm">TOTAL</span>
          <span className="text-emerald-400 font-black text-xl">$50.500</span>
        </div>
      </div>

      {/* CTA */}
      <button className="btn-p w-full rounded-xl py-3 text-sm">
        💳 &nbsp;Cobrar $50.500
      </button>

      {/* Mini chart */}
      <div className="mt-4 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div className="flex items-end justify-between gap-1" style={{ height:'36px' }}>
          {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bar-anim" style={{ height:`${h}%`, background: i === 5 ? 'rgba(16,185,129,.8)' : 'rgba(16,185,129,.25)', animationDelay:`${i * 0.08}s` }} />
          ))}
        </div>
        <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px', marginTop:'4px', textAlign:'center' }}>Ventas de la semana</p>
      </div>
    </div>
  );
}

/* ─── NAVBAR ──────────────────────────────────────────────────────────────── */
function Navbar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 nav-glass">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">

        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center btn-p">
            <ShoppingCart size={15} />
          </div>
          <span className="font-black text-white text-base tracking-tight">
            FERZU&nbsp;<span className="g-text">POS</span>
          </span>
        </button>

        {/* Links */}
        <div className="hidden md:flex items-center gap-7">
          {[['#modulos','Módulos'],['#como-funciona','Cómo funciona'],['#precios','Precios'],['#dian','DIAN']].map(([h, l]) => (
            <a key={l} href={h} className="text-sm font-medium transition-colors" style={{ color:'rgba(255,255,255,.45)' }}
              onMouseEnter={e => e.target.style.color='#fff'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,.45)'}>
              {l}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <button onClick={() => navigate('/login')} className="text-sm font-medium transition-colors px-3 py-2" style={{ color:'rgba(255,255,255,.45)' }}
            onMouseEnter={e => e.target.style.color='#fff'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,.45)'}>
            Iniciar sesión
          </button>
          <button onClick={() => navigate('/register')} className="btn-p text-sm px-5 py-2.5 rounded-xl">
            Empieza gratis
          </button>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-white transition-opacity" style={{ opacity: open ? 1 : 0.5 }}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden px-5 py-5 flex flex-col gap-4" style={{ background:'rgba(2,11,18,.97)', borderTop:'1px solid rgba(255,255,255,.07)' }}>
          {[['#modulos','Módulos'],['#como-funciona','Cómo funciona'],['#precios','Precios'],['#dian','DIAN']].map(([h, l]) => (
            <a key={l} href={h} className="text-sm font-medium" style={{ color:'rgba(255,255,255,.6)' }} onClick={() => setOpen(false)}>{l}</a>
          ))}
          <div style={{ height:'1px', background:'rgba(255,255,255,.08)' }} />
          <button onClick={() => navigate('/login')} className="text-sm text-left" style={{ color:'rgba(255,255,255,.5)' }}>Iniciar sesión</button>
          <button onClick={() => { navigate('/register'); setOpen(false); }} className="btn-p text-sm py-3 rounded-xl">
            Empieza gratis
          </button>
        </div>
      )}
    </nav>
  );
}

/* ─── HERO ────────────────────────────────────────────────────────────────── */
function Hero() {
  const navigate = useNavigate();
  return (
    <section className="hero-bg min-h-screen pt-16 flex items-center relative overflow-hidden">
      {/* Orbs ambientales */}
      <div className="orb orb-a" style={{ width:'700px', height:'700px', top:'-200px', left:'-200px', background:'radial-gradient(circle,rgba(16,185,129,.18) 0%,transparent 65%)' }} />
      <div className="orb orb-b" style={{ width:'600px', height:'600px', bottom:'-200px', right:'-200px', background:'radial-gradient(circle,rgba(5,150,105,.14) 0%,transparent 65%)' }} />
      <div className="orb orb-b" style={{ width:'300px', height:'300px', top:'40%', left:'45%', background:'radial-gradient(circle,rgba(6,182,212,.06) 0%,transparent 65%)' }} />

      <div className="relative max-w-6xl mx-auto px-5 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* ── Columna izquierda ── */}
          <div>
            <div className="a1">
              <span className="s-tag">🇨🇴 &nbsp;Hecho para Colombia</span>
            </div>

            <h1 className="a2 mt-7 font-black text-white leading-[1.05] tracking-tight" style={{ fontSize:'clamp(42px,6vw,72px)' }}>
              El POS que<br />
              <span className="shimmer-text">impulsa</span> tu<br />
              negocio
            </h1>

            <p className="a3 mt-6 leading-relaxed max-w-md" style={{ color:'rgba(255,255,255,.5)', fontSize:'17px' }}>
              Sistema de punto de venta inteligente para restaurantes, barberías,
              talleres y más. Funciona <strong style={{ color:'rgba(255,255,255,.85)', fontWeight:600 }}>sin internet</strong>, con{' '}
              <strong style={{ color:'rgba(255,255,255,.85)', fontWeight:600 }}>IA integrada</strong> y precios en pesos colombianos.
            </p>

            <div className="a4 mt-8 flex flex-col sm:flex-row gap-4">
              <button onClick={() => navigate('/register')} className="btn-p px-8 py-4 rounded-2xl text-base flex items-center justify-center gap-2.5">
                Empieza gratis hoy <ArrowRight size={18} />
              </button>
              <button onClick={() => navigate('/login')} className="btn-g font-semibold px-8 py-4 rounded-2xl text-base">
                Ya tengo cuenta
              </button>
            </div>

            {/* Stats */}
            <div className="a5 mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { v:'100%',     l:'Offline-first' },
                { v:'< 2 min', l:'Registro' },
                { v:'6+',      l:'Sectores' },
                { v:'24/7',    l:'Disponible' },
              ].map(({ v, l }) => (
                <div key={l} className="glass rounded-2xl py-3 px-4 text-center">
                  <p className="g-text font-black text-xl">{v}</p>
                  <p style={{ color:'rgba(255,255,255,.35)', fontSize:'11px', marginTop:'2px' }}>{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Columna derecha — Mock POS ── */}
          <div className="relative hidden lg:flex justify-center items-center">
            {/* Glow ring behind card */}
            <div style={{
              position:'absolute', inset:'0',
              background:'radial-gradient(circle at 50% 50%,rgba(16,185,129,.18) 0%,transparent 65%)',
              pointerEvents:'none',
            }} />

            {/* Main POS card */}
            <div className="fa relative z-10">
              <MockPOS />
            </div>

            {/* Floating card: Revenue */}
            <div className="fb absolute -top-6 -right-6 z-20">
              <div className="glass-sm rounded-2xl px-4 py-3 flex items-center gap-3" style={{ boxShadow:'0 10px 40px rgba(0,0,0,.4)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center glow-e-sm" style={{ background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)' }}>
                  <TrendingUp size={17} className="text-emerald-400" />
                </div>
                <div>
                  <p style={{ color:'rgba(255,255,255,.4)', fontSize:'11px' }}>Ventas hoy</p>
                  <p className="text-white font-bold text-sm">$847.500</p>
                </div>
              </div>
            </div>

            {/* Floating card: AI */}
            <div className="fc absolute -bottom-4 -left-8 z-20">
              <div className="glass-sm rounded-2xl px-4 py-3 flex items-center gap-3" style={{ boxShadow:'0 10px 40px rgba(0,0,0,.4)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center glow-e" style={{ background:'rgba(16,185,129,.25)', border:'1px solid rgba(16,185,129,.4)' }}>
                  <Cpu size={17} className="text-emerald-400" />
                </div>
                <div>
                  <p style={{ color:'rgba(255,255,255,.4)', fontSize:'11px' }}>IA activa</p>
                  <p className="text-emerald-400 font-bold text-sm">Analizando…</p>
                </div>
              </div>
            </div>

            {/* Floating card: Pedidos */}
            <div className="fb absolute top-1/2 -left-10 z-20" style={{ animationDelay:'2s' }}>
              <div className="glass-sm rounded-2xl px-3 py-2.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(249,115,22,.2)', border:'1px solid rgba(249,115,22,.35)' }}>
                  <ChefHat size={13} style={{ color:'#f97316' }} />
                </div>
                <div>
                  <p style={{ color:'rgba(255,255,255,.4)', fontSize:'10px' }}>Pedidos activos</p>
                  <p className="text-white font-bold" style={{ fontSize:'13px' }}>12 en cocina</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

/* ─── TICKER ──────────────────────────────────────────────────────────────── */
function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="alt-bg py-4 ticker-wrap" style={{ borderTop:'1px solid rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
      <div className="ticker-inner">
        {doubled.map((it, i) => (
          <span key={i} className="inline-flex items-center font-semibold" style={{ color:'rgba(255,255,255,.28)', fontSize:'13px', marginRight:'0' }}>
            <span style={{ padding:'0 28px' }}>{it}</span>
            <span style={{ color:'rgba(16,185,129,.4)', fontSize:'8px' }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── FEATURES (BENTO) ────────────────────────────────────────────────────── */
function Features() {
  return (
    <section className="section-bg py-24 px-5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <span className="s-tag">Por qué FERZU POS</span>
          <h2 className="mt-4 font-black text-white" style={{ fontSize:'clamp(32px,5vw,52px)', lineHeight:1.1 }}>
            Diseñado para el<br /><span className="g-text">comerciante colombiano</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Card grande: Offline */}
          <div className="gb md:col-span-2 p-8 hov" style={{ cursor:'default' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6" style={{ background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.3)' }}>
              <Wifi size={24} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black text-2xl mb-3">Funciona sin internet</h3>
            <p className="max-w-sm leading-relaxed" style={{ color:'rgba(255,255,255,.5)', fontSize:'15px' }}>
              La única herramienta de POS en Colombia que garantiza que puedes cobrar aunque
              se vaya la luz o la conexión. <strong style={{ color:'rgba(255,255,255,.8)' }}>Offline-first real.</strong>
            </p>
            {/* Status visual */}
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { s:'Con WiFi',    c:'#10b981', bg:'rgba(16,185,129,.1)', bd:'rgba(16,185,129,.25)', txt:'✓ Activo' },
                { s:'Sin WiFi',    c:'#eab308', bg:'rgba(234,179,8,.1)',  bd:'rgba(234,179,8,.25)',  txt:'✓ Funciona' },
                { s:'Reconexión', c:'#06b6d4', bg:'rgba(6,182,212,.1)',  bd:'rgba(6,182,212,.25)',  txt:'⟳ Sincronizando' },
              ].map(({ s, c, bg, bd, txt }) => (
                <div key={s} className="rounded-xl p-3 text-center" style={{ background:bg, border:`1px solid ${bd}` }}>
                  <div className="w-2.5 h-2.5 rounded-full mx-auto mb-2" style={{ background:c }} />
                  <p style={{ color:'rgba(255,255,255,.5)', fontSize:'11px' }}>{s}</p>
                  <p className="font-bold mt-1" style={{ color:c, fontSize:'11px' }}>{txt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card: IA */}
          <div className="gb p-6 hov" style={{ cursor:'default' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.25)' }}>
              <TrendingUp size={20} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black text-base mb-2">IA integrada</h3>
            <p style={{ color:'rgba(255,255,255,.45)', fontSize:'14px', lineHeight:'1.6' }}>
              El sistema analiza tus ventas y te dice qué está pasando en lenguaje natural. Sin reportes complicados.
            </p>
            <div className="mt-5 glass rounded-xl p-3">
              <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px', marginBottom:'6px' }}>💬 Análisis automático</p>
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'12px', lineHeight:'1.5' }}>
                "Tus ventas de hamburguesas subieron 23% este lunes. Considera abrir antes los viernes."
              </p>
            </div>
          </div>

          {/* Cards pequeñas */}
          {[
            { icon:Zap,        t:'En 10 minutos',       d:'Tu equipo aprende a usar FERZU POS en menos de 10 minutos. Sin capacitaciones largas.' },
            { icon:Shield,     t:'Datos protegidos',    d:'Información protegida bajo la Ley 1581 de Habeas Data de Colombia.' },
            { icon:Smartphone, t:'Cualquier pantalla',  d:'Tablet, computador o celular. Solo el navegador, sin instalaciones.' },
            { icon:Globe,      t:'24/7 disponible',     d:'Sin caídas, sin mantenimientos nocturnos. Siempre encendido.' },
          ].map(({ icon:Icon, t, d }) => (
            <div key={t} className="gb p-6 hov" style={{ cursor:'default' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.22)' }}>
                <Icon size={19} className="text-emerald-400" />
              </div>
              <h3 className="text-white font-bold text-sm mb-2">{t}</h3>
              <p style={{ color:'rgba(255,255,255,.42)', fontSize:'13px', lineHeight:'1.6' }}>{d}</p>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}

/* ─── SERVICES SHOWCASE ───────────────────────────────────────────────────── */
function ServicesShowcase() {
  const [active, setActive] = useState(0)

  const SERVICES = [
    {
      icon: ShoppingCart,
      tag:  'Cobro rápido',
      title:'De producto a recibo en 8 segundos',
      desc: 'Busca por nombre o escanea. El sistema maneja los cálculos — tú solo atiendes al cliente.',
      bullets:['Búsqueda instantánea de productos','Escáner USB y cámara','Efectivo, tarjeta y Nequi/Bold','Recibo impreso o por WhatsApp'],
    },
    {
      icon: BarChart3,
      tag:  'Dashboard + Reportes',
      title:'Entiende tu negocio en un vistazo',
      desc: 'Ventas del día, productos más vendidos y tendencias — todo en tiempo real sin exportar nada.',
      bullets:['KPIs actualizados en tiempo real','Ventas por hora, día y mes','Exportar a Excel y PDF con un clic','Análisis con IA en lenguaje natural'],
    },
    {
      icon: Package,
      tag:  'Inventario inteligente',
      title:'Stock al día, sin hojas de Excel',
      desc: 'El inventario se descuenta automáticamente con cada venta. Alertas de bajo stock incluidas.',
      bullets:['Descuento automático al vender','Alertas de bajo stock','Multi-sucursal en tiempo real','Escáner de códigos de barras'],
    },
    {
      icon: Smartphone,
      tag:  'WhatsApp + Impresora',
      title:'El recibo como tus clientes prefieren',
      desc: 'Envía el comprobante por WhatsApp o imprime en tu térmica. Sin papel extra, sin complicaciones.',
      bullets:['Enlace de recibo por WhatsApp Web','Impresora térmica USB 58/80mm','Sin app adicional instalada','Funciona en tablet, PC y celular'],
    },
  ]

  // ── Mocks de UI ────────────────────────────────────────────────────────────
  const POSMock = () => (
    <div style={{ width:'100%', maxWidth:'360px' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-black text-sm">🛒 Nueva venta</span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background:'rgba(16,185,129,.15)', color:'#10b981', border:'1px solid rgba(16,185,129,.3)' }}>F2 nueva</span>
      </div>
      <div className="glass rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
        <span style={{ color:'rgba(255,255,255,.3)', fontSize:'14px' }}>🔍</span>
        <span style={{ color:'rgba(255,255,255,.25)', fontSize:'13px' }}>Buscar producto o escanear…</span>
      </div>
      {[
        { name:'Hamburguesa doble', qty:1, price:'$18.000' },
        { name:'Papas medianas',    qty:2, price:'$12.000' },
        { name:'Gaseosa 500ml',     qty:1, price:'$5.000'  },
      ].map((p) => (
        <div key={p.name} className="flex items-center justify-between py-2.5" style={{ borderBottom:'1px solid rgba(255,255,255,.06)' }}>
          <div>
            <p className="text-white text-sm font-medium">{p.name}</p>
            <p style={{ color:'rgba(255,255,255,.3)', fontSize:'11px' }}>× {p.qty}</p>
          </div>
          <span className="text-white font-bold text-sm">{p.price}</span>
        </div>
      ))}
      <div className="mt-4 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,.1)' }}>
        <div className="flex justify-between items-center mb-4">
          <span className="text-white font-black text-lg">Total</span>
          <span className="font-black text-2xl" style={{ color:'#10b981' }}>$35.000</span>
        </div>
        <button className="w-full btn-p py-4 rounded-2xl font-black text-white text-base">
          💳 Cobrar — F4
        </button>
      </div>
    </div>
  )

  const DashboardMock = () => (
    <div style={{ width:'100%', maxWidth:'360px' }}>
      <div className="flex items-center justify-between mb-5">
        <span className="text-white font-black text-sm">📊 Dashboard — Hoy</span>
        <span className="text-xs px-2 py-1 rounded-lg" style={{ background:'rgba(16,185,129,.12)', color:'#10b981', border:'1px solid rgba(16,185,129,.25)' }}>↓ Exportar</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label:'Ventas hoy', val:'$487K', trend:'+12%' },
          { label:'Órdenes',    val:'34',    trend:'+5'   },
          { label:'Ticket prom',val:'$14K',  trend:'↑'   },
        ].map(({ label, val, trend }) => (
          <div key={label} className="glass rounded-xl p-3 text-center">
            <p style={{ color:'rgba(255,255,255,.35)', fontSize:'10px', marginBottom:'4px' }}>{label}</p>
            <p className="font-black text-white" style={{ fontSize:'15px' }}>{val}</p>
            <p style={{ color:'#10b981', fontSize:'10px', marginTop:'2px' }}>{trend}</p>
          </div>
        ))}
      </div>
      <div className="glass rounded-xl p-4">
        <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px', marginBottom:'12px' }}>Ventas por hora</p>
        <div className="flex items-end gap-1.5" style={{ height:'56px' }}>
          {[20,35,55,45,70,88,60,42].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm" style={{
              height:`${h}%`,
              background: i === 5 ? '#10b981' : 'rgba(16,185,129,.22)',
            }} />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {['8am','10','12','2pm','4','6pm','8','10'].map(t => (
            <span key={t} style={{ color:'rgba(255,255,255,.2)', fontSize:'8px' }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )

  const InventoryMock = () => (
    <div style={{ width:'100%', maxWidth:'360px' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-black text-sm">📦 Inventario</span>
        <div className="text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ background:'rgba(239,68,68,.12)', color:'#f87171', border:'1px solid rgba(239,68,68,.25)' }}>
          ⚠ 2 bajo stock
        </div>
      </div>
      <div className="glass rounded-xl px-3 py-2.5 mb-4 flex items-center gap-2">
        <span style={{ color:'rgba(255,255,255,.25)', fontSize:'12px' }}>🔍 Buscar o escanear producto…</span>
      </div>
      <div className="space-y-2">
        {[
          { name:'Hamburguesa doble', stock:48, status:'ok'       },
          { name:'Papas medianas',    stock:12, status:'low'      },
          { name:'Gaseosa 500ml',     stock:3,  status:'critical' },
          { name:'Jugo natural',      stock:27, status:'ok'       },
        ].map(({ name, stock, status }) => (
          <div key={name} className="glass rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-medium" style={{ fontSize:'12px' }}>{name}</p>
              <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px' }}>Stock: {stock} und</p>
            </div>
            <div className="flex items-center gap-2">
              {status !== 'ok' && (
                <span style={{ fontSize:'10px', color: status === 'critical' ? '#f87171' : '#eab308' }}>
                  {status === 'critical' ? '¡Reponer!' : 'Bajo'}
                </span>
              )}
              <div className="w-2.5 h-2.5 rounded-full" style={{
                background: status === 'ok' ? '#10b981' : status === 'low' ? '#eab308' : '#ef4444',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const WhatsAppMock = () => (
    <div style={{ width:'100%', maxWidth:'340px' }}>
      <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background:'#25d366' }}>
          📱
        </div>
        <div>
          <p className="text-white font-black text-sm">WhatsApp · Comprobante</p>
          <p style={{ color:'rgba(255,255,255,.35)', fontSize:'11px' }}>Envío automático al cliente</p>
        </div>
      </div>
      <div className="rounded-2xl rounded-bl-none p-4 mb-4" style={{ background:'#1a2e1a', border:'1px solid rgba(37,211,102,.2)', maxWidth:'280px' }}>
        <p style={{ color:'rgba(37,211,102,.9)', fontSize:'10px', fontWeight:'800', marginBottom:'8px', letterSpacing:'.3px' }}>
          🧾 FERZU POS — Comprobante #847
        </p>
        <div style={{ background:'rgba(0,0,0,.35)', borderRadius:'8px', padding:'10px', fontFamily:'monospace', fontSize:'10px', color:'rgba(255,255,255,.7)', lineHeight:'1.8' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}><span>1× Hamburguesa</span><span>$18.000</span></div>
          <div style={{ display:'flex', justifyContent:'space-between' }}><span>2× Papas</span><span>$12.000</span></div>
          <div style={{ borderTop:'1px dashed rgba(255,255,255,.15)', margin:'4px 0' }} />
          <div style={{ display:'flex', justifyContent:'space-between', color:'#25d366', fontWeight:'700' }}>
            <span>TOTAL</span><span>$30.000</span>
          </div>
        </div>
        <p style={{ color:'rgba(255,255,255,.25)', fontSize:'9px', marginTop:'6px', textAlign:'right' }}>✓✓ Entregado · 14:32</p>
      </div>
      <div className="flex items-center gap-3 glass rounded-xl p-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.25)' }}>
          🖨️
        </div>
        <div>
          <p className="text-white font-bold" style={{ fontSize:'12px' }}>Impresora térmica 58/80mm</p>
          <p style={{ color:'rgba(255,255,255,.35)', fontSize:'10px' }}>Epson TM-T20 · XP-58 · ZJ-58</p>
        </div>
        <div className="ml-auto w-2.5 h-2.5 rounded-full" style={{ background:'#10b981' }} />
      </div>
    </div>
  )

  const mocks = [<POSMock key="pos" />, <DashboardMock key="dash" />, <InventoryMock key="inv" />, <WhatsAppMock key="wa" />]

  return (
    <section className="section-bg py-24 px-5">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="s-tag">Servicios incluidos</span>
          <h2 className="mt-4 font-black text-white" style={{ fontSize:'clamp(32px,5vw,52px)', lineHeight:1.1 }}>
            Todo lo que necesitas,<br /><span className="g-text">en un solo lugar.</span>
          </h2>
          <p className="mt-4" style={{ color:'rgba(255,255,255,.4)', fontSize:'15px', maxWidth:'480px', margin:'14px auto 0' }}>
            Cuatro módulos esenciales diseñados para el comercio colombiano real.
          </p>
        </div>

        {/* Layout 2 cols */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

          {/* Tabs de servicio */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            {SERVICES.map(({ icon: Icon, tag, title, bullets }, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className="text-left rounded-2xl p-5 transition-all duration-300"
                style={{
                  background:  active === i ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)',
                  border:      `1px solid ${active === i ? 'rgba(16,185,129,.35)' : 'rgba(255,255,255,.07)'}`,
                  boxShadow:   active === i ? '0 0 24px rgba(16,185,129,.08)' : 'none',
                  cursor:      'pointer',
                }}
              >
                <div className="flex items-center gap-3 mb-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      background: active === i ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.05)',
                      border:     `1px solid ${active === i ? 'rgba(16,185,129,.4)' : 'rgba(255,255,255,.1)'}`,
                    }}
                  >
                    <Icon size={16} style={{ color: active === i ? '#10b981' : 'rgba(255,255,255,.35)', transition:'color .3s' }} />
                  </div>
                  <span className="font-black text-sm transition-colors duration-300"
                    style={{ color: active === i ? '#fff' : 'rgba(255,255,255,.45)' }}>
                    {tag}
                  </span>
                </div>
                {active === i && (
                  <div className="mt-3">
                    <p className="font-black text-white text-sm mb-3 leading-snug">{title}</p>
                    <ul className="space-y-1.5">
                      {bullets.map(b => (
                        <li key={b} className="flex items-start gap-2" style={{ color:'rgba(255,255,255,.5)', fontSize:'12px' }}>
                          <span style={{ color:'#10b981', fontSize:'10px', marginTop:'2px', flexShrink:0 }}>✓</span> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Preview del servicio */}
          <div className="lg:col-span-3 rounded-3xl p-8 flex items-center justify-center"
            style={{
              background:'rgba(255,255,255,.025)',
              border:'1px solid rgba(255,255,255,.07)',
              minHeight:'420px',
            }}>
            {mocks[active]}
          </div>

        </div>
      </div>
    </section>
  )
}

/* ─── MODULES ─────────────────────────────────────────────────────────────── */
function Modules() {
  return (
    <section id="modulos" className="alt-bg py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="s-tag">Módulos disponibles</span>
          <h2 className="mt-4 font-black text-white" style={{ fontSize:'clamp(32px,5vw,52px)', lineHeight:1.1 }}>
            Un sistema.<br /><span className="g-text">Todo lo que necesitas.</span>
          </h2>
          <p className="mt-4" style={{ color:'rgba(255,255,255,.4)', fontSize:'15px' }}>
            Activa solo los módulos de tu negocio. Pagas únicamente por lo que usas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULOS.map(({ icon:Icon, t, d, accent, bg, bd }) => (
            <div key={t}
              className="hov rounded-2xl p-5 dark-card"
              style={{ borderLeft:`3px solid ${accent}`, cursor:'default' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background:bg, border:`1px solid ${bd}` }}>
                <Icon size={19} style={{ color:accent }} />
              </div>
              <h3 className="text-white font-bold text-sm mb-2">{t}</h3>
              <p style={{ color:'rgba(255,255,255,.38)', fontSize:'12px', lineHeight:'1.65' }}>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ────────────────────────────────────────────────────────── */
function HowItWorks() {
  return (
    <section id="como-funciona" className="section-bg py-24 px-5">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <span className="s-tag">Proceso</span>
          <h2 className="mt-4 font-black text-white" style={{ fontSize:'clamp(32px,5vw,52px)' }}>
            Listo en <span className="g-text">3 pasos</span>
          </h2>
        </div>

        <div className="flex flex-col gap-5">
          {[
            { num:'01', t:'Regístrate gratis', d:'Crea tu cuenta en 2 minutos. Sin tarjeta de crédito, sin compromisos. Solo tu email y el nombre de tu negocio.' },
            { num:'02', t:'Configura tu negocio', d:'Agrega productos con precios, activa los módulos que necesitas y personaliza el POS para tu tipo de negocio.' },
            { num:'03', t:'Empieza a cobrar', d:'Tu equipo puede usar el POS desde cualquier dispositivo, con o sin internet. La IA ya está analizando tus ventas.' },
          ].map(({ num, t, d }, i) => (
            <div key={num} className="gb flex gap-6 p-7 hov items-start">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white glow-e" style={{ background:'linear-gradient(135deg,#10b981,#059669)', minWidth:'56px' }}>
                {num}
              </div>
              <div>
                <h3 className="text-white font-black text-lg mb-2">{t}</h3>
                <p style={{ color:'rgba(255,255,255,.45)', fontSize:'14px', lineHeight:'1.65' }}>{d}</p>
              </div>
              {i < 2 && (
                <div className="hidden md:flex ml-auto flex-shrink-0 items-center" style={{ color:'rgba(16,185,129,.4)' }}>
                  <ArrowRight size={18} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PRICING ─────────────────────────────────────────────────────────────── */
function Pricing() {
  const navigate = useNavigate();
  return (
    <section id="precios" className="alt-bg py-24 px-5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <span className="s-tag">Precios</span>
          <h2 className="mt-4 font-black text-white" style={{ fontSize:'clamp(32px,5vw,52px)', lineHeight:1.1 }}>
            En <span className="g-text">pesos colombianos</span>
          </h2>
          <p className="mt-4" style={{ color:'rgba(255,255,255,.4)', fontSize:'15px' }}>
            Sin cobros en dólares. Sin sorpresas. Cancela cuando quieras.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {PLANES.map(({ nombre, precio, desc, items, cta, hot }) => (
            <div key={nombre}
              className={`rounded-2xl p-7 flex flex-col ${hot ? 'price-hot' : 'dark-card'} ${hot ? 'scale-105 relative z-10' : ''}`}
            >
              {hot && (
                <span className="self-start mb-5 px-3 py-1 rounded-full text-xs font-black tracking-wide" style={{ background:'linear-gradient(135deg,#10b981,#34d399)', color:'#000' }}>
                  ⭐ MÁS POPULAR
                </span>
              )}
              <h3 className="text-white font-black text-xl">{nombre}</h3>
              <p className="mt-1 mb-6" style={{ color:'rgba(255,255,255,.4)', fontSize:'13px' }}>{desc}</p>
              <div className="mb-7 flex items-baseline gap-1">
                <span className={`font-black ${hot ? 'g-text' : 'text-white'}`} style={{ fontSize:'clamp(28px,4vw,40px)' }}>{precio}</span>
                <span style={{ color:'rgba(255,255,255,.3)', fontSize:'13px' }}> / mes</span>
              </div>
              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {items.map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color:'rgba(255,255,255,.7)' }}>
                    <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/register')}
                className={`w-full py-3.5 rounded-xl font-bold text-sm ${hot ? 'btn-p' : 'btn-g'}`}
              >
                {cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center mt-8" style={{ color:'rgba(255,255,255,.25)', fontSize:'13px' }}>
          Todos los planes incluyen <strong style={{ color:'rgba(255,255,255,.4)' }}>14 días de prueba gratis</strong> · Sin tarjeta de crédito
        </p>
      </div>
    </section>
  );
}

/* ─── DIAN ────────────────────────────────────────────────────────────────── */
function DIAN() {
  return (
    <section id="dian" className="section-bg py-24 px-5">
      <div className="max-w-4xl mx-auto">
        <div className="gb rounded-3xl p-8 md:p-12">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            {/* Info */}
            <div className="flex-1">
              <span className="s-tag">Add-on opcional</span>
              <h2 className="mt-5 font-black text-white" style={{ fontSize:'clamp(28px,4vw,42px)', lineHeight:1.15 }}>
                Facturación<br />Electrónica <span className="g-text">DIAN</span>
              </h2>
              <p className="mt-4 leading-relaxed" style={{ color:'rgba(255,255,255,.45)', fontSize:'15px' }}>
                Emite facturas en formato UBL 2.1 directamente desde FERZU POS.
                Cumple con la normativa de la DIAN sin complicaciones.
                Solo lo activas si lo necesitas.
              </p>
              <ul className="mt-7 flex flex-col gap-3.5">
                {['Generación XML UBL 2.1 automática','Firma digital con tu certificado .p12','PDF con código QR oficial DIAN','Historial completo de facturas emitidas'].map(it => (
                  <li key={it} className="flex items-center gap-3 text-sm" style={{ color:'rgba(255,255,255,.65)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.4)' }}>
                      <CheckCircle2 size={11} className="text-emerald-400" />
                    </div>
                    {it}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card precio */}
            <div className="glass rounded-2xl p-7 text-center glow-e w-full md:w-64 flex-shrink-0">
              <p style={{ color:'rgba(255,255,255,.4)', fontSize:'13px' }}>Add-on desde</p>
              <p className="g-text font-black mt-1" style={{ fontSize:'52px', lineHeight:1.1 }}>$30K</p>
              <p style={{ color:'rgba(255,255,255,.3)', fontSize:'12px', marginTop:'4px' }}>COP / mes adicional al plan</p>
              <a
                href="mailto:fjfc1984@gmail.com?subject=Quiero%20activar%20Facturación%20Electrónica%20DIAN"
                className="btn-p mt-6 w-full py-3 rounded-xl text-sm block text-center"
              >
                Me interesa
              </a>
              <p style={{ color:'rgba(255,255,255,.3)', fontSize:'12px', marginTop:'10px' }}>Respuesta en &lt; 24 horas</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA FINAL ───────────────────────────────────────────────────────────── */
function CTAFinal() {
  const navigate = useNavigate();
  return (
    <section className="deep-bg py-28 px-5 relative overflow-hidden">
      {/* Orb central */}
      <div className="orb orb-a" style={{ width:'600px', height:'600px', top:'-100px', left:'50%', transform:'translateX(-50%)', background:'radial-gradient(circle,rgba(16,185,129,.2) 0%,transparent 65%)' }} />

      <div className="relative max-w-2xl mx-auto text-center">
        <div className="a1">
          <span className="s-tag">🚀 &nbsp;Comienza ahora</span>
        </div>
        <h2 className="a2 mt-6 font-black text-white" style={{ fontSize:'clamp(34px,5vw,56px)', lineHeight:1.1 }}>
          Tu negocio merece<br /><span className="shimmer-text">el mejor POS</span>
        </h2>
        <p className="a3 mt-5 leading-relaxed" style={{ color:'rgba(255,255,255,.45)', fontSize:'17px' }}>
          Únete a los negocios colombianos que cobran más rápido y venden más con FERZU POS.
        </p>
        <div className="a4 mt-10 flex justify-center">
          <button
            onClick={() => navigate('/register')}
            className="btn-p inline-flex items-center gap-3 font-black text-lg px-10 py-5 rounded-2xl"
          >
            Empieza gratis hoy <ArrowRight size={22} />
          </button>
        </div>
        <p className="a5 mt-5" style={{ color:'rgba(255,255,255,.22)', fontSize:'13px' }}>
          Sin tarjeta de crédito · 14 días de prueba gratis · Cancela cuando quieras
        </p>
      </div>
    </section>
  );
}

/* ─── FOOTER ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="alt-bg py-10 px-5" style={{ borderTop:'1px solid rgba(255,255,255,.07)' }}>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center btn-p">
            <ShoppingCart size={13} />
          </div>
          <span className="font-black text-sm text-white">FERZU <span className="g-text">POS</span></span>
        </div>

        <div className="flex gap-7">
          {[['#modulos','Módulos'],['#precios','Precios'],['#dian','DIAN'],['mailto:fjfc1984@gmail.com','Contacto']].map(([h, l]) => (
            <a key={l} href={h} style={{ color:'rgba(255,255,255,.28)', fontSize:'13px', transition:'color .2s' }}
              onMouseEnter={e => e.target.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e => e.target.style.color='rgba(255,255,255,.28)'}>
              {l}
            </a>
          ))}
        </div>

        <p style={{ color:'rgba(255,255,255,.2)', fontSize:'12px' }}>
          © 2026 FERZU POS · Colombia
        </p>
      </div>
    </footer>
  );
}

/* ─── EXPORT ──────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen font-sans antialiased" style={{ background:'#020b12' }}>
        <Navbar />
        <Hero />
        <Ticker />
        <Features />
        <ServicesShowcase />
        <Modules />
        <HowItWorks />
        <Pricing />
        <DIAN />
        <CTAFinal />
        <Footer />
      </div>
    </>
  );
}
