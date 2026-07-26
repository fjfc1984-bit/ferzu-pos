// =============================================================================
// FERZU POS — LANDING PAGE PÚBLICA
// Ruta: / (pública, sin autenticación)
// Para desactivar: cambiar ruta / en App.jsx de vuelta a Navigate to="/login"
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Users, BarChart3, Package, Scissors, ChefHat,
  Wrench, Store, CheckCircle2, ArrowRight, Zap, Shield, Wifi,
  Star, ChevronDown, Menu, X, FileText, Smartphone, Clock,
  TrendingUp, DollarSign, Globe
} from 'lucide-react';

// ── DATOS ────────────────────────────────────────────────────────────────────

const MODULOS = [
  {
    icon: ShoppingCart,
    title: 'Punto de Venta',
    desc: 'Cobra rápido con búsqueda de productos, descuentos, múltiples métodos de pago y cambio automático.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Package,
    title: 'Inventario',
    desc: 'Control de stock en tiempo real, alertas de agotamiento, historial de movimientos y proveedores.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Scissors,
    title: 'Barbería / Spa',
    desc: 'Agenda de citas, control de turnos, historial por cliente y comisiones para estilistas.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: ChefHat,
    title: 'Cocina (KDS)',
    desc: 'Pantalla de cocina en tiempo real. Los pedidos llegan automáticamente sin papel ni intermediarios.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Wrench,
    title: 'Taller Mecánico',
    desc: 'Órdenes de trabajo, seguimiento de reparaciones, repuestos y notificación al cliente cuando está listo.',
    color: 'bg-red-50 text-red-600',
  },
  {
    icon: Store,
    title: 'Minimarket',
    desc: 'Venta por peso, control de vencimientos, código de barras y descuentos por volumen.',
    color: 'bg-yellow-50 text-yellow-600',
  },
  {
    icon: BarChart3,
    title: 'Dashboard IA',
    desc: 'Reportes diarios, KPIs del negocio y análisis automático con inteligencia artificial.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    icon: FileText,
    title: 'Facturación DIAN',
    desc: 'Emisión de facturas electrónicas en formato UBL 2.1 con firma digital. Add-on opcional.',
    color: 'bg-gray-50 text-gray-600',
  },
];

const PASOS = [
  {
    num: '01',
    title: 'Regístrate gratis',
    desc: 'Crea tu cuenta en 2 minutos. Sin tarjeta de crédito. Sin compromisos.',
  },
  {
    num: '02',
    title: 'Configura tu negocio',
    desc: 'Agrega tus productos, precios y activa los módulos que necesitas.',
  },
  {
    num: '03',
    title: 'Empieza a cobrar',
    desc: 'Tu equipo ya puede usar el POS desde cualquier dispositivo, con o sin internet.',
  },
];

const PLANES = [
  {
    nombre: 'Starter',
    precio: '$49.900',
    desc: 'Ideal para negocios pequeños que empiezan.',
    modulos: ['POS básico', 'Hasta 2 usuarios', 'Inventario simple', 'Soporte por email'],
    color: 'border-gray-200',
    badge: '',
    cta: 'Empezar gratis',
    highlight: false,
  },
  {
    nombre: 'Pro',
    precio: '$89.900',
    desc: 'El favorito de restaurantes y barberías.',
    modulos: ['Todo lo de Starter', 'Hasta 5 usuarios', 'Módulo especializado', 'Dashboard IA', 'Soporte prioritario'],
    color: 'border-emerald-500',
    badge: 'MÁS POPULAR',
    cta: 'Empezar con Pro',
    highlight: true,
  },
  {
    nombre: 'Enterprise',
    precio: '$149.900',
    desc: 'Para negocios con múltiples sucursales.',
    modulos: ['Todo lo de Pro', 'Usuarios ilimitados', 'Múltiples sucursales', 'Facturación DIAN', 'Soporte 24/7'],
    color: 'border-gray-200',
    badge: '',
    cta: 'Contactar ventas',
    highlight: false,
  },
];

const TIPOS_NEGOCIO = [
  { icon: ChefHat,   label: 'Restaurantes' },
  { icon: Scissors,  label: 'Barberías' },
  { icon: Wrench,    label: 'Talleres' },
  { icon: Store,     label: 'Minimarkets' },
  { icon: ShoppingCart, label: 'Tiendas' },
  { icon: Users,     label: 'Spas y Salones' },
];

const STATS = [
  { valor: '100%', label: 'Funciona offline' },
  { valor: '< 2 min', label: 'Tiempo de registro' },
  { valor: '6+', label: 'Tipos de negocio' },
  { valor: '24/7', label: 'Disponibilidad' },
];

// ── COMPONENTES ──────────────────────────────────────────────────────────────

function Navbar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <ShoppingCart size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">FERZU <span className="text-emerald-600">POS</span></span>
        </div>

        {/* Nav desktop */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <a href="#modulos" className="hover:text-emerald-600 transition-colors">Módulos</a>
          <a href="#como-funciona" className="hover:text-emerald-600 transition-colors">Cómo funciona</a>
          <a href="#precios" className="hover:text-emerald-600 transition-colors">Precios</a>
          <a href="#dian" className="hover:text-emerald-600 transition-colors">Facturación DIAN</a>
        </div>

        {/* CTA desktop */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium px-4 py-2"
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => navigate('/register')}
            className="text-sm bg-emerald-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Empieza gratis
          </button>
        </div>

        {/* Mobile menu toggle */}
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-4">
          <a href="#modulos" className="text-sm text-gray-700" onClick={() => setOpen(false)}>Módulos</a>
          <a href="#como-funciona" className="text-sm text-gray-700" onClick={() => setOpen(false)}>Cómo funciona</a>
          <a href="#precios" className="text-sm text-gray-700" onClick={() => setOpen(false)}>Precios</a>
          <a href="#dian" className="text-sm text-gray-700" onClick={() => setOpen(false)}>Facturación DIAN</a>
          <button onClick={() => navigate('/login')} className="text-sm text-gray-700 text-left">Iniciar sesión</button>
          <button
            onClick={() => navigate('/register')}
            className="text-sm bg-emerald-600 text-white font-semibold px-4 py-2.5 rounded-lg"
          >
            Empieza gratis
          </button>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section className="bg-gradient-to-br from-gray-950 via-gray-900 to-emerald-950 pt-32 pb-20 px-4 text-center relative overflow-hidden">
      {/* Decoración */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-64 h-64 bg-emerald-500 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-400 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto">
        <span className="inline-block bg-emerald-500/20 text-emerald-400 text-xs font-bold px-4 py-1.5 rounded-full mb-6 border border-emerald-500/30">
          🇨🇴 HECHO PARA COLOMBIA
        </span>

        <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-6">
          El POS que hace crecer<br />
          <span className="text-emerald-400">tu negocio</span> en Colombia
        </h1>

        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Sistema de punto de venta inteligente para restaurantes, barberías, talleres, minimarkets y más.
          Funciona sin internet, con IA integrada y precios en pesos colombianos.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
          <button
            onClick={() => navigate('/register')}
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-4 rounded-xl text-base transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
          >
            Empieza gratis hoy
            <ArrowRight size={18} />
          </button>
          <button
            onClick={() => navigate('/login')}
            className="border border-gray-600 text-gray-300 hover:border-emerald-500 hover:text-emerald-400 font-semibold px-8 py-4 rounded-xl text-base transition-all"
          >
            Ya tengo cuenta
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {STATS.map(({ valor, label }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-xl py-3 px-4">
              <p className="text-emerald-400 font-black text-xl">{valor}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ParaQuienEs() {
  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-emerald-600 font-bold text-sm uppercase tracking-wider mb-3">Para quién es</p>
        <h2 className="text-3xl font-black text-gray-900 mb-10">Funciona para tu tipo de negocio</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {TIPOS_NEGOCIO.map(({ icon: Icon, label }) => (
            <div key={label} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-3 shadow-sm border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Icon size={22} className="text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Ventajas() {
  const items = [
    { icon: Wifi,       title: 'Offline primero',      desc: 'Cobra sin internet. Se sincroniza automáticamente cuando regresa la conexión.' },
    { icon: Smartphone, title: 'En cualquier pantalla', desc: 'Funciona en tablet, computador o celular. Sin instalación.' },
    { icon: Shield,     title: 'Datos seguros',         desc: 'Tu información está protegida bajo la Ley 1581 de Habeas Data.' },
    { icon: Zap,        title: 'Rápido de aprender',   desc: 'Tu equipo aprende a usarlo en menos de 10 minutos.' },
    { icon: TrendingUp, title: 'IA integrada',          desc: 'Reportes automáticos en lenguaje natural. El sistema te dice qué está pasando.' },
    { icon: Globe,      title: 'Siempre disponible',    desc: 'Sin mantenimientos ni caídas. Disponibilidad 24/7 garantizada.' },
  ];

  return (
    <section className="py-20 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-emerald-600 font-bold text-sm uppercase tracking-wider mb-3">Por qué FERZU POS</p>
          <h2 className="text-3xl font-black text-gray-900">Diseñado para el comerciante colombiano</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {items.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4 p-5 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={18} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modulos() {
  return (
    <section id="modulos" className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-emerald-600 font-bold text-sm uppercase tracking-wider mb-3">Módulos disponibles</p>
          <h2 className="text-3xl font-black text-gray-900">Un solo sistema. Todo lo que necesitas.</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">Activa solo los módulos de tu negocio. Pagas por lo que usas.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
          {MODULOS.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-emerald-200 transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                <Icon size={20} />
              </div>
              <h3 className="font-bold text-gray-900 text-sm mb-2">{title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComoFunciona() {
  return (
    <section id="como-funciona" className="py-20 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-emerald-600 font-bold text-sm uppercase tracking-wider mb-3">Proceso</p>
          <h2 className="text-3xl font-black text-gray-900">Empiezas a cobrar en 3 pasos</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Línea conectora desktop */}
          <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-0.5 bg-emerald-100" style={{left:'16%', right:'16%'}} />
          {PASOS.map(({ num, title, desc }) => (
            <div key={num} className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-emerald-200 relative z-10">
                <span className="text-white font-black text-xl">{num}</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Precios() {
  const navigate = useNavigate();
  return (
    <section id="precios" className="py-20 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-emerald-600 font-bold text-sm uppercase tracking-wider mb-3">Precios</p>
          <h2 className="text-3xl font-black text-gray-900">Planes en pesos colombianos</h2>
          <p className="text-gray-500 mt-3">Sin cobros en dólares. Sin sorpresas. Cancela cuando quieras.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANES.map(({ nombre, precio, desc, modulos, color, badge, cta, highlight }) => (
            <div
              key={nombre}
              className={`bg-white rounded-2xl border-2 ${color} p-6 flex flex-col shadow-sm ${highlight ? 'shadow-emerald-100 shadow-lg scale-105' : ''} transition-all`}
            >
              {badge && (
                <span className="self-start bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                  {badge}
                </span>
              )}
              <h3 className="font-black text-gray-900 text-xl mb-1">{nombre}</h3>
              <p className="text-gray-500 text-sm mb-4">{desc}</p>
              <div className="mb-6">
                <span className="text-3xl font-black text-gray-900">{precio}</span>
                <span className="text-gray-400 text-sm"> / mes</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                {modulos.map(m => (
                  <li key={m} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                    {m}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/register')}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                  highlight
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border-2 border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-600'
                }`}
              >
                {cta}
              </button>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-400 text-xs mt-6">
          Todos los planes incluyen 14 días de prueba gratis. Sin tarjeta de crédito.
        </p>
      </div>
    </section>
  );
}

function DIANSection() {
  return (
    <section id="dian" className="py-20 px-4 bg-emerald-600">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-10">
        <div className="flex-1 text-white">
          <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">ADD-ON OPCIONAL</span>
          <h2 className="text-3xl font-black mt-4 mb-4">Facturación Electrónica DIAN</h2>
          <p className="text-emerald-100 leading-relaxed mb-6">
            Emite facturas electrónicas en formato UBL 2.1 directamente desde FERZU POS.
            Cumple con la normativa de la DIAN sin complicaciones. Solo lo activas si lo necesitas.
          </p>
          <ul className="flex flex-col gap-3">
            {['Generación XML UBL 2.1 automática', 'Firma digital con tu certificado .p12', 'PDF con código QR oficial DIAN', 'Historial completo de facturas'].map(i => (
              <li key={i} className="flex items-center gap-3 text-sm text-white">
                <CheckCircle2 size={16} className="text-emerald-200 shrink-0" />
                {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-2xl p-7 w-full md:w-72 text-center shadow-xl">
          <p className="text-gray-500 text-sm mb-1">Add-on disponible desde</p>
          <p className="text-emerald-600 font-black text-3xl mb-1">$30.000</p>
          <p className="text-gray-400 text-xs mb-5">COP / mes adicional al plan</p>
          <a
            href="mailto:fjfc1984@gmail.com?subject=Quiero%20activar%20Facturación%20Electrónica%20DIAN"
            className="block w-full bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-emerald-700 transition-colors"
          >
            Me interesa
          </a>
          <p className="text-gray-400 text-xs mt-3">Te contactamos en menos de 24 horas</p>
        </div>
      </div>
    </section>
  );
}

function CTAFinal() {
  const navigate = useNavigate();
  return (
    <section className="py-20 px-4 bg-gray-950 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
          Tu negocio merece el mejor POS
        </h2>
        <p className="text-gray-400 text-lg mb-10">
          Únete a los negocios colombianos que ya usan FERZU POS para cobrar más rápido y vender más.
        </p>
        <button
          onClick={() => navigate('/register')}
          className="bg-emerald-500 hover:bg-emerald-400 text-white font-black px-10 py-4 rounded-xl text-lg transition-all shadow-lg shadow-emerald-500/25 inline-flex items-center gap-3"
        >
          Empieza gratis hoy
          <ArrowRight size={20} />
        </button>
        <p className="text-gray-600 text-sm mt-4">Sin tarjeta de crédito · 14 días de prueba gratis · Cancela cuando quieras</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-10 px-4">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center">
            <ShoppingCart size={14} className="text-white" />
          </div>
          <span className="font-bold text-white">FERZU POS</span>
        </div>
        <div className="flex gap-6 text-sm text-gray-500">
          <a href="#modulos" className="hover:text-gray-300 transition-colors">Módulos</a>
          <a href="#precios" className="hover:text-gray-300 transition-colors">Precios</a>
          <a href="#dian" className="hover:text-gray-300 transition-colors">DIAN</a>
          <a href="mailto:fjfc1984@gmail.com" className="hover:text-gray-300 transition-colors">Contacto</a>
        </div>
        <p className="text-gray-600 text-xs">© 2026 FERZU POS · Colombia</p>
      </div>
    </footer>
  );
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans">
      <Navbar />
      <Hero />
      <ParaQuienEs />
      <Ventajas />
      <Modulos />
      <ComoFunciona />
      <Precios />
      <DIANSection />
      <CTAFinal />
      <Footer />
    </div>
  );
}
