#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FERZU POS — Guia Completa para Clientes
Genera FERZU_POS_Guia_Completa_v3.pdf con diseno profesional usando ReportLab
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.platypus.flowables import Flowable
import os

OUTPUT = "C:/Users/fjfc1/Downloads/ferzu-pos/FERZU_POS_Guia_Completa_v3.pdf"

GREEN       = colors.HexColor('#059669')
GREEN_DARK  = colors.HexColor('#047857')
GREEN_LIGHT = colors.HexColor('#D1FAE5')
GREEN_MID   = colors.HexColor('#6EE7B7')
GRAY_DARK   = colors.HexColor('#1F2937')
GRAY_MID    = colors.HexColor('#6B7280')
GRAY_LIGHT  = colors.HexColor('#F3F4F6')
GRAY_BORDER = colors.HexColor('#E5E7EB')
YELLOW_BG   = colors.HexColor('#FFFBEB')
YELLOW      = colors.HexColor('#F59E0B')
BLUE        = colors.HexColor('#2563EB')
BLUE_BG     = colors.HexColor('#EFF6FF')
RED         = colors.HexColor('#DC2626')
RED_BG      = colors.HexColor('#FEF2F2')
WHITE       = colors.white

W, H = A4
MARGIN = 1.8 * cm

STYLE_BODY = ParagraphStyle('Body', fontSize=10, leading=15, textColor=GRAY_DARK,
    fontName='Helvetica', spaceAfter=4)
STYLE_STEP = ParagraphStyle('Step', fontSize=10, leading=15, textColor=GRAY_DARK,
    fontName='Helvetica', leftIndent=22, spaceAfter=3)
STYLE_H4   = ParagraphStyle('H4', fontSize=11, leading=14, textColor=GRAY_DARK,
    fontName='Helvetica-Bold', spaceBefore=6, spaceAfter=3)

styles = getSampleStyleSheet()

class SectionHeader(Flowable):
    def __init__(self, num, title, subtitle='', w=None):
        Flowable.__init__(self)
        self.num = num; self.title = title; self.subtitle = subtitle
        self.w = w or (W - 2*MARGIN); self.h = 48 if subtitle else 38
    def wrap(self, *args): return self.w, self.h
    def draw(self):
        c = self.canv
        c.setFillColor(GREEN)
        c.roundRect(0, 0, self.w, self.h, 6, fill=1, stroke=0)
        c.setFillColor(GREEN_MID); c.setFont('Helvetica-Bold', 22)
        c.drawString(12, self.h - 30, self.num)
        c.setFillColor(WHITE); c.setFont('Helvetica-Bold', 15)
        c.drawString(50, self.h - 26, self.title)
        if self.subtitle:
            c.setFillColor(colors.HexColor('#A7F3D0')); c.setFont('Helvetica', 9)
            c.drawString(50, self.h - 40, self.subtitle)

class SubHeader(Flowable):
    def __init__(self, title, w=None):
        Flowable.__init__(self)
        self.title = title; self.w = w or (W - 2*MARGIN); self.h = 28
    def wrap(self, *args): return self.w, self.h
    def draw(self):
        c = self.canv
        c.setFillColor(GREEN); c.rect(0, 4, 4, 20, fill=1, stroke=0)
        c.setFillColor(GREEN_LIGHT); c.roundRect(6, 2, self.w - 6, 24, 4, fill=1, stroke=0)
        c.setFillColor(GREEN_DARK); c.setFont('Helvetica-Bold', 11)
        c.drawString(16, 9, self.title)

class NoteBox(Flowable):
    TYPES = {
        'tip':  (BLUE_BG,   BLUE,   'CONSEJO: '),
        'warn': (YELLOW_BG, YELLOW, 'IMPORTANTE: '),
        'info': (GREEN_LIGHT, GREEN,'NOTA: '),
        'err':  (RED_BG,    RED,    'ATENCION: '),
    }
    def __init__(self, text, kind='tip', w=None):
        Flowable.__init__(self)
        self.text = text; self.kind = kind
        self.w = w or (W - 2*MARGIN)
        lines = max(1, len(text) // 90 + 1)
        self.h = 14 + lines * 13
    def wrap(self, *args): return self.w, self.h
    def draw(self):
        c = self.canv
        bg, brd, prefix = self.TYPES.get(self.kind, self.TYPES['tip'])
        c.setFillColor(bg); c.roundRect(0, 0, self.w, self.h, 4, fill=1, stroke=0)
        c.setStrokeColor(brd); c.setLineWidth(0.8)
        c.roundRect(0, 0, self.w, self.h, 4, fill=0, stroke=1)
        c.setFillColor(brd); c.setFont('Helvetica-Bold', 9)
        pw = c.stringWidth(prefix, 'Helvetica-Bold', 9)
        c.drawString(8, self.h - 12, prefix)
        c.setFillColor(GRAY_DARK); c.setFont('Helvetica', 9)
        c.drawString(8 + pw, self.h - 12, self.text)

class KbdShortcut(Flowable):
    def __init__(self, key, desc, w=None):
        Flowable.__init__(self)
        self.key = key; self.desc = desc
        self.w = w or (W - 2*MARGIN); self.h = 24
    def wrap(self, *args): return self.w, self.h
    def draw(self):
        c = self.canv
        c.setFillColor(GRAY_DARK); c.roundRect(0, 4, 48, 18, 3, fill=1, stroke=0)
        c.setFillColor(WHITE); c.setFont('Helvetica-Bold', 10)
        c.drawCentredString(24, 9, self.key)
        c.setFillColor(GRAY_DARK); c.setFont('Helvetica', 10)
        c.drawString(58, 9, self.desc)

def on_page(canvas, doc):
    canvas.saveState()
    pw, ph = A4
    canvas.setFillColor(GREEN)
    canvas.rect(0, ph-22, pw, 22, fill=1, stroke=0)
    canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 10)
    canvas.drawString(MARGIN, ph-15, 'FERZU POS')
    canvas.setFont('Helvetica', 9)
    canvas.drawRightString(pw-MARGIN, ph-15, 'Guia del Usuario — ferzu-pos.vercel.app')
    canvas.setFillColor(GRAY_LIGHT)
    canvas.rect(0, 0, pw, 18, fill=1, stroke=0)
    canvas.setFillColor(GRAY_MID); canvas.setFont('Helvetica', 8)
    canvas.drawString(MARGIN, 5, 'Confidencial — Solo para uso del cliente')
    canvas.drawRightString(pw-MARGIN, 5, f'Pagina {doc.page}')
    canvas.restoreState()

def on_page_first(canvas, doc): pass

def sp(n=6): return Spacer(1, n)
def body(t): return Paragraph(t, STYLE_BODY)
def step(n, t): return Paragraph(f'<b>Paso {n}.</b>  {t}', STYLE_STEP)
def tip(t):  return NoteBox(t, 'tip')
def warn(t): return NoteBox(t, 'warn')
def info(t): return NoteBox(t, 'info')
def kbd(k, d): return KbdShortcut(k, d)

def tbl2(rows, w1=0.38):
    tw = W - 2*MARGIN
    cw = [tw*w1, tw*(1-w1)]
    st = TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GREEN),('TEXTCOLOR',(0,0),(-1,0),WHITE),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),9),
        ('LEADING',(0,0),(-1,-1),13),('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LIGHT]),
        ('GRID',(0,0),(-1,-1),0.5,GRAY_BORDER),('PADDING',(0,0),(-1,-1),6),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
    ])
    return Table(rows, colWidths=cw, style=st, hAlign='LEFT')

def tbl3(rows, w1=0.25, w2=0.42):
    tw = W - 2*MARGIN
    cw = [tw*w1, tw*w2, tw*(1-w1-w2)]
    st = TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GREEN),('TEXTCOLOR',(0,0),(-1,0),WHITE),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),9),
        ('LEADING',(0,0),(-1,-1),13),('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LIGHT]),
        ('GRID',(0,0),(-1,-1),0.5,GRAY_BORDER),('PADDING',(0,0),(-1,-1),6),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
    ])
    return Table(rows, colWidths=cw, style=st, hAlign='LEFT')

# ── PORTADA ────────────────────────────────────────────────────────────────────
def cover():
    class CoverBlock(Flowable):
        def __init__(self):
            Flowable.__init__(self)
            self.w = W - 2*MARGIN; self.h = 11*cm
        def wrap(self,*a): return self.w, self.h
        def draw(self):
            c=self.canv
            c.setFillColor(GREEN); c.roundRect(0,0,self.w,self.h,10,fill=1,stroke=0)
            c.setFillColor(WHITE); c.setFont('Helvetica-Bold',48)
            c.drawString(30,self.h-80,'FERZU POS')
            c.setFillColor(GREEN_MID); c.setFont('Helvetica',14)
            c.drawString(30,self.h-108,'Sistema de Punto de Venta para Negocios Colombianos')
            c.setFillColor(GREEN_DARK); c.roundRect(30,20,200,34,6,fill=1,stroke=0)
            c.setFillColor(GREEN_MID); c.setFont('Helvetica-Bold',12)
            c.drawString(40,31,'Guia Completa del Usuario v3.0')
    s=[]
    s.append(CoverBlock()); s.append(sp(18))
    s.append(body('FERZU POS es un sistema de punto de venta en la nube, disenado para restaurantes, '
                  'barberias, talleres mecanicos y minimarkets en Colombia. Esta guia describe paso a '
                  'paso todos los modulos y funciones disponibles.'))
    s.append(sp(14))
    datos=[
        ['DATO','DETALLE'],
        ['URL de acceso','https://ferzu-pos.vercel.app'],
        ['Compatibilidad','Chrome, Edge, Firefox — PC, tablet, celular'],
        ['Soporte offline','Si — sincroniza automaticamente al reconectarse'],
        ['Facturacion DIAN','Integrada (Resolucion + IVA automatico)'],
        ['Asistente IA','Claude AI (Haiku rapido + Sonnet avanzado)'],
        ['Actualizaciones','Automaticas — sin instalacion adicional'],
    ]
    s.append(tbl2(datos)); s.append(sp(18))
    s.append(Paragraph('<b>Modulos incluidos:</b>', STYLE_H4)); s.append(sp(6))
    mods=[
        ['01. Acceso y configuracion inicial','08. Barberia / Peluqueria / SPA'],
        ['02. Punto de Venta (POS)','09. Taller Mecanico'],
        ['03. Dashboard y metricas','10. Restaurante — Gestion de mesas'],
        ['04. Inventario y productos','11. Minimarket'],
        ['05. Clientes y fidelizacion','12. Turnos y asistencia'],
        ['06. Reporte diario de ventas','13. Asistente de IA'],
        ['07. Facturacion DIAN','14. Configuracion e integraciones'],
    ]
    tw=W-2*MARGIN
    mst=TableStyle([('FONTSIZE',(0,0),(-1,-1),10),('LEADING',(0,0),(-1,-1),14),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE,GRAY_LIGHT]),
        ('GRID',(0,0),(-1,-1),0.5,GRAY_BORDER),('PADDING',(0,0),(-1,-1),7)])
    s.append(Table(mods,colWidths=[tw/2-2,tw/2-2],style=mst,hAlign='LEFT'))
    s.append(PageBreak()); return s

# ── SECCION 1: ACCESO ─────────────────────────────────────────────────────────
def s01():
    s=[]
    s.append(SectionHeader('01','ACCESO Y CONFIGURACION INICIAL',
             'Registro, login, seleccion de sucursal y PIN de seguridad'))
    s.append(sp(10))
    s.append(SubHeader('Registro de nuevo negocio')); s.append(sp(4))
    s.append(body('Si es la primera vez que usa FERZU POS, debe registrarse como administrador. El proceso toma menos de 5 minutos.'))
    s.append(sp(5))
    for n,t in [(1,'Abra su navegador y vaya a: https://ferzu-pos.vercel.app'),
                (2,'Haga clic en "Crear cuenta" o "Registrarme".'),
                (3,'Ingrese su correo electronico y cree una contrasena segura.'),
                (4,'Confirme su correo (revise la bandeja de entrada).'),
                (5,'El sistema lo llevara al Asistente de Configuracion Inicial (Onboarding).')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Asistente de configuracion inicial (Onboarding)')); s.append(sp(4))
    s.append(body('La primera vez, el sistema le pedira los datos de su negocio:'))
    s.append(sp(4))
    s.append(tbl3([['Campo','Descripcion','Ejemplo'],
        ['Nombre del negocio','Nombre comercial','Restaurante El Buen Sabor'],
        ['NIT','Numero de identificacion tributaria','900.123.456-7'],
        ['Tipo de negocio','Restaurante, barberia, taller, minimarket','Restaurante'],
        ['Nombre de sucursal','Nombre de la primera sede','Sede Principal'],
        ['Ciudad','Ciudad donde opera','Bogota, Medellin, Cali...']]))
    s.append(sp(6))
    s.append(info('El NIT se usa para facturacion DIAN. Puede configurarlo despues si no lo tiene disponible.'))
    s.append(sp(8))
    s.append(SubHeader('Inicio de sesion diario')); s.append(sp(4))
    for n,t in [(1,'Abra https://ferzu-pos.vercel.app en el navegador.'),
                (2,'Ingrese su correo y contrasena.'),
                (3,'Si tiene varias sucursales, seleccione en cual va a trabajar hoy.'),
                (4,'Si el negocio tiene PIN activo, ingreselo (4 digitos).'),
                (5,'El sistema lo llevara al Dashboard (panel principal).')]:
        s.append(step(n,t))
    s.append(sp(6))
    s.append(tip('Guarde la pagina como acceso directo en el escritorio del navegador para acceder mas rapido.'))
    s.append(sp(8))
    s.append(SubHeader('PIN de seguridad (bloqueo de pantalla)')); s.append(sp(4))
    s.append(body('FERZU POS tiene bloqueo por PIN para proteger el acceso cuando el equipo queda desatendido:'))
    s.append(sp(4))
    s.append(body('  - Activar / desactivar desde Configuracion > Seguridad.'))
    s.append(body('  - El admin define el tiempo de inactividad (5, 10 o 15 min).'))
    s.append(body('  - El PIN es compartido entre todos los empleados de la sucursal.'))
    s.append(sp(4))
    s.append(warn('Si olvida el PIN, el administrador puede desbloquearlo desde Configuracion ingresando con su contrasena de cuenta.'))
    s.append(PageBreak()); return s

# ── SECCION 2: POS ────────────────────────────────────────────────────────────
def s02():
    s=[]
    s.append(SectionHeader('02','PUNTO DE VENTA (POS)',
             'Cobro, metodos de pago, descuentos, cortesias e impresion'))
    s.append(sp(10))
    s.append(body('El POS es la pantalla principal de cobro. Desde aqui el cajero registra cada venta, selecciona productos, aplica descuentos y procesa el pago.'))
    s.append(sp(8))
    s.append(SubHeader('Abrir la caja (apertura de turno)')); s.append(sp(4))
    for n,t in [(1,'Vaya al modulo POS desde el menu lateral.'),
                (2,'El sistema muestra el modal "Apertura de Caja".'),
                (3,'Ingrese el monto de efectivo inicial (ej: $200.000 COP).'),
                (4,'Haga clic en "Abrir Caja". El turno queda registrado.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(warn('No se pueden registrar ventas si la caja no esta abierta. El sistema le pedira que la abra primero.'))
    s.append(sp(8))
    s.append(SubHeader('Realizar una venta paso a paso')); s.append(sp(4))
    for n,t in [(1,'En la grilla de productos, busque el articulo por nombre o categoria.'),
                (2,'Escanee el codigo de barras con camara o lector USB (tecla F8).'),
                (3,'Haga clic en el producto para agregarlo al carrito (panel derecho).'),
                (4,'Ajuste la cantidad con los botones + y - del carrito.'),
                (5,'Repita para todos los articulos de la venta.'),
                (6,'Haga clic en "Cobrar" o presione F4.'),
                (7,'Seleccione el metodo de pago y confirme la venta.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Metodos de pago disponibles')); s.append(sp(4))
    s.append(tbl2([['Metodo','Como usarlo'],
        ['Efectivo','Ingrese el monto recibido. El sistema calcula el vuelto automaticamente.'],
        ['Tarjeta debito / credito','Seleccione el tipo y confirme. Queda registrado en el reporte.'],
        ['Nequi','Seleccione Nequi. El cliente paga desde su app movil.'],
        ['Daviplata','Igual que Nequi. Confirme el pago antes de cerrar la venta.'],
        ['Bold (datafono)','Integrado con el datafono Bold. El cobro se sincroniza automaticamente.'],
        ['Pago mixto','Combina dos metodos (ej: parte efectivo + parte tarjeta).'],
        ['Cortesia','La venta se registra en $0. Ver seccion de Cortesias mas abajo.']]))
    s.append(sp(8))
    s.append(SubHeader('Variantes de producto (tallas, colores, presentaciones)')); s.append(sp(4))
    s.append(body('Los productos pueden tener variantes: por ejemplo, una camiseta en S, M, L, XL o un refresco en 250ml, 500ml, 1L.'))
    s.append(sp(4))
    for n,t in [(1,'Haga clic en un producto que tenga variantes.'),
                (2,'El sistema abre un modal de seleccion de variante.'),
                (3,'Elija la variante deseada (talla, color, presentacion).'),
                (4,'Cada variante tiene su propio precio y stock independiente.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(info('Las variantes se configuran en Inventario > Productos > Editar producto > Variantes.'))
    s.append(sp(8))
    s.append(SubHeader('Aplicar descuento')); s.append(sp(4))
    for n,t in [(1,'Con una orden activa, haga clic en el icono de descuento (%).'),
                (2,'Ingrese el porcentaje o valor fijo del descuento.'),
                (3,'Si el negocio requiere autorizacion, el sistema pedira aprobacion del admin.'),
                (4,'El descuento se refleja en el total y queda en el reporte.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Cortesias (ventas sin costo al cliente)')); s.append(sp(4))
    s.append(body('Una cortesia es cuando el negocio asume el costo sin cobrarle al cliente '
                  '(diferente a un descuento pactado). El inventario y el costo quedan registrados.'))
    s.append(sp(4))
    for n,t in [(1,'Con la orden lista, haga clic en "Cortesia" en el panel de cobro.'),
                (2,'Ingrese quien autoriza la cortesia (dueno o gerente).'),
                (3,'Ingrese el motivo: "cliente VIP", "error en cocina", "regalo gerencia".'),
                (4,'La venta se cierra en $0 para el cliente, pero el costo real queda registrado.'),
                (5,'El reporte de cortesias muestra el costo total asumido por el negocio.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(warn('Las cortesias reducen la caja pero quedan registradas. El admin las ve en Dashboard > Reportes.'))
    s.append(sp(8))
    s.append(SubHeader('Asignar cliente a la venta')); s.append(sp(4))
    for n,t in [(1,'Haga clic en el icono de usuario en el POS.'),
                (2,'Busque al cliente por nombre, cedula o telefono.'),
                (3,'Los puntos de fidelidad se acumulan automaticamente.'),
                (4,'Si no existe, puede crearlo directamente desde el buscador.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Tipos de recibo / impresion')); s.append(sp(4))
    s.append(tbl3([['Tipo','Como funciona','Cuando usarlo'],
        ['Impresora termica ESC/POS','Conexion USB o Bluetooth. Recibo fisico 80mm.','Cuando tenga impresora termica conectada.'],
        ['WhatsApp','Envia el recibo como mensaje al numero del cliente.','Cuando el cliente prefiere recibo digital.'],
        ['Sin recibo','La venta queda en el sistema sin imprimir.','Pagos rapidos sin necesidad de comprobante.']]))
    s.append(sp(8))
    s.append(SubHeader('Cierre de caja (fin del turno)')); s.append(sp(4))
    for n,t in [(1,'Haga clic en "Cerrar Caja" en el POS.'),
                (2,'Cuente el efectivo fisico y registre el monto real.'),
                (3,'El sistema calcula la diferencia entre lo esperado y lo contado.'),
                (4,'Confirme el cierre. El turno queda con resumen completo.'),
                (5,'Ver el reporte del turno en Dashboard > Reporte Diario.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Atajos de teclado del POS')); s.append(sp(6))
    for k,d in [('F2','Nueva venta — limpia el carrito actual'),
                ('F4','Cobrar — abre el modal de pago'),
                ('F8','Escaner — activa la camara para leer codigos de barras'),
                ('ESC','Cancelar — cierra el modal activo'),
                ('F5','Refrescar datos de la pantalla')]:
        s.append(kbd(k,d)); s.append(sp(3))
    s.append(PageBreak()); return s

# ── SECCION 3: DASHBOARD ──────────────────────────────────────────────────────
def s03():
    s=[]
    s.append(SectionHeader('03','DASHBOARD Y METRICAS',
             'Panel del dueno: KPIs, graficas, alertas y reporte IA'))
    s.append(sp(10))
    s.append(body('El Dashboard es la pantalla de inicio para el administrador. Muestra en tiempo real el rendimiento del negocio.'))
    s.append(sp(8))
    s.append(tbl2([['Metrica / Tarjeta','Que muestra'],
        ['Ventas del dia','Total vendido en COP desde la apertura de hoy.'],
        ['Numero de ordenes','Cantidad de transacciones completadas en el dia.'],
        ['Ticket promedio','Valor promedio por venta del dia.'],
        ['Clientes nuevos','Cuantos clientes nuevos se registraron hoy.'],
        ['Grafica de ventas','Ventas por hora del dia y comparativo de la semana.'],
        ['Mapa de calor','Horas del dia con mayor actividad de ventas.'],
        ['Top 5 productos','Los articulos mas vendidos del dia o la semana.'],
        ['Alertas de stock','Productos que estan por debajo del stock minimo.'],
        ['Estado de la caja','Si esta abierta, quien la abrio y a que hora.'],
        ['Reporte IA','Analisis en espanol generado por Claude AI.']]))
    s.append(sp(8))
    s.append(SubHeader('Como usar el reporte IA del Dashboard')); s.append(sp(4))
    for n,t in [(1,'En la tarjeta "Reporte IA", haga clic en "Generar analisis".'),
                (2,'El asistente analiza las ventas, stock y metricas del dia.'),
                (3,'En segundos recibe un resumen: que va bien, que mejorar.'),
                (4,'Puede exportarlo a PDF o enviarlo por correo electronico.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(tip('El reporte IA es especialmente util al final del dia para el dueno que no estuvo presente durante el turno.'))
    s.append(PageBreak()); return s

# ── SECCION 4: INVENTARIO ─────────────────────────────────────────────────────
def s04():
    s=[]
    s.append(SectionHeader('04','INVENTARIO Y PRODUCTOS',
             'CRUD de productos, variantes, stock, movimientos y proveedores'))
    s.append(sp(10))
    s.append(body('Gestione todos los productos: crear, editar, controlar stock y registrar movimientos de entrada y salida.'))
    s.append(sp(8))
    s.append(SubHeader('Campos al crear un producto')); s.append(sp(4))
    s.append(tbl2([['Campo','Descripcion'],
        ['Nombre','Nombre del producto tal como aparece en el POS.'],
        ['Categoria','Agrupa el producto (bebidas, comidas, servicios).'],
        ['Precio de venta','Precio al cliente en COP.'],
        ['Costo','Precio de compra o produccion (para calcular margen).'],
        ['Stock actual','Unidades disponibles al crearlo.'],
        ['Stock minimo','Nivel de alerta. El Dashboard avisa cuando baje de aqui.'],
        ['Codigo de barras','Opcional. Permite buscar con escaner en el POS.'],
        ['IVA','Tarifa de IVA: 0%, 5% o 19% (para DIAN).'],
        ['Variantes','Opcional. Tallas, colores o presentaciones.'],
        ['Imagen','Foto que aparece en la grilla del POS.']]))
    s.append(sp(8))
    s.append(SubHeader('Gestionar el stock (entradas y ajustes)')); s.append(sp(4))
    for n,t in [(1,'Vaya a Inventario > pestana "Movimientos".'),
                (2,'Haga clic en "Registrar Entrada" para una compra a proveedor.'),
                (3,'Ingrese el producto, cantidad y proveedor.'),
                (4,'Para un ajuste manual (conteo fisico), use "Ajuste de Stock".'),
                (5,'Todos los movimientos quedan con fecha, usuario y motivo.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Pestanas del modulo de inventario')); s.append(sp(4))
    s.append(tbl2([['Pestana','Funcion'],
        ['Productos','Lista completa. Crear, editar, desactivar productos.'],
        ['Movimientos','Historial de entradas, salidas y ajustes de stock.'],
        ['Proveedores','Registro de proveedores con contacto y condiciones.'],
        ['Insights IA','Analisis de rotacion de inventario generado por IA.']]))
    s.append(sp(5))
    s.append(tip('Puede importar productos masivamente desde un archivo CSV con el boton "Importar" en la lista de productos.'))
    s.append(PageBreak()); return s

# ── SECCION 5: CLIENTES ───────────────────────────────────────────────────────
def s05():
    s=[]
    s.append(SectionHeader('05','CLIENTES Y FIDELIZACION',
             'CRM basico, historial de compras y puntos de lealtad'))
    s.append(sp(10))
    s.append(body('Registre y conozca a sus compradores habituales, vea su historial de compras y gestione puntos de fidelizacion.'))
    s.append(sp(8))
    s.append(SubHeader('Campos al registrar un cliente')); s.append(sp(4))
    s.append(tbl2([['Campo','Descripcion'],
        ['Nombre completo','Nombre del cliente.'],
        ['Cedula / ID','Numero de identificacion (opcional, util para facturacion DIAN).'],
        ['Telefono / WhatsApp','Para enviar recibos y notificaciones.'],
        ['Correo electronico','Para reportes y comunicaciones.'],
        ['Cumpleanos','Opcional. Para segmentacion y ofertas especiales.']]))
    s.append(sp(8))
    s.append(SubHeader('Segmentos automaticos de clientes')); s.append(sp(4))
    s.append(tbl3([['Segmento','Criterio','Como usarlo'],
        ['VIP','20 o mas compras','Alta frecuencia. Ofrece beneficios especiales.'],
        ['Frecuente','5 a 19 compras','Buenos clientes. Mantener con ofertas.'],
        ['Regular','2 a 4 compras','En proceso de fidelizacion.'],
        ['Nuevo','1 compra','Primera visita. Importante fidelizarlos.'],
        ['Inactivo','Sin compras recientes','Reactivar con promociones o comunicacion.']]))
    s.append(sp(8))
    s.append(SubHeader('Sistema de puntos de fidelizacion')); s.append(sp(4))
    for n,t in [(1,'Configure en Configuracion > Fidelizacion: cuantos puntos acumula por cada $1.000 COP.'),
                (2,'Los puntos se acumulan automaticamente al asignar el cliente a una venta.'),
                (3,'El cliente puede ver sus puntos en su perfil.'),
                (4,'Para redimir puntos, aplique el saldo como descuento en la proxima compra.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(tip('El historial completo de compras de cada cliente esta disponible en su perfil: que compro, cuanto gasto y en que fecha.'))
    s.append(PageBreak()); return s

# ── SECCION 6: REPORTE DIARIO ─────────────────────────────────────────────────
def s06():
    s=[]
    s.append(SectionHeader('06','REPORTE DIARIO DE VENTAS',
             'Resumen del dia, comparativos y envio por correo'))
    s.append(sp(10))
    s.append(body('El Reporte Diario muestra el resumen completo de ventas de un dia especifico: totales, metodos de pago, productos mas vendidos y comparativo.'))
    s.append(sp(8))
    s.append(tbl2([['Seccion del reporte','Que muestra'],
        ['KPIs del dia','Total ventas, ordenes, ticket promedio, propinas.'],
        ['Ventas por hora','Grafica de barras con la actividad por hora del dia.'],
        ['Metodos de pago','Desglose: efectivo, tarjeta, Nequi, Daviplata, Bold.'],
        ['Top productos','Los articulos mas vendidos con cantidad y valor total.'],
        ['Comparativo','Diferencia con el mismo dia de la semana anterior.']]))
    s.append(sp(8))
    s.append(SubHeader('Como navegar el reporte')); s.append(sp(4))
    for n,t in [(1,'Vaya a menu lateral > "Reporte Diario" o desde Dashboard > ver reporte completo.'),
                (2,'Use las flechas < > para navegar entre dias anteriores.'),
                (3,'Haga clic en "Enviar por email" para recibir el reporte en su correo.'),
                (4,'El reporte se puede exportar a PDF con el boton de descarga.')]:
        s.append(step(n,t))
    s.append(PageBreak()); return s

# ── SECCION 7: DIAN ───────────────────────────────────────────────────────────
def s07():
    s=[]
    s.append(SectionHeader('07','FACTURACION ELECTRONICA DIAN',
             'Configuracion, emision de facturas y contingencias'))
    s.append(sp(10))
    s.append(body('FERZU POS incluye facturacion electronica integrada con la DIAN. Cada venta puede emitirse como factura electronica valida en Colombia.'))
    s.append(sp(8))
    s.append(SubHeader('Configuracion inicial DIAN')); s.append(sp(4))
    for n,t in [(1,'Vaya a DIAN > "Configurar facturacion" o use el Asistente DIAN.'),
                (2,'Ingrese los datos de su resolucion: numero, prefijo, rango de folios y fecha de vencimiento.'),
                (3,'Configure el regimen tributario: Simplificado o Comun.'),
                (4,'Asigne el IVA a cada producto en Inventario > Productos (0%, 5% o 19%).'),
                (5,'Haga una factura de prueba para verificar la configuracion.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(warn('La resolucion DIAN tiene un rango de folios y fecha de vencimiento. FERZU POS le avisa cuando este cerca del limite.'))
    s.append(sp(8))
    s.append(SubHeader('Pestanas del modulo DIAN')); s.append(sp(4))
    s.append(tbl2([['Pestana','Funcion'],
        ['Resumen','Estado de la resolucion activa, facturas del dia y de la semana.'],
        ['Facturas','Listado completo de facturas emitidas con estado y opciones.'],
        ['Contingencias','Facturas que fallaron y estan pendientes de reenvio a DIAN.'],
        ['Validar NIT','Herramienta para verificar si un NIT es valido en tiempo real.']]))
    s.append(sp(8))
    s.append(SubHeader('Tarifas de IVA en Colombia')); s.append(sp(4))
    s.append(tbl2([['Tarifa IVA','Aplica a'],
        ['0% (Exento)','Productos de la canasta basica, medicamentos, libros.'],
        ['5%','Algunos alimentos procesados y bienes especificos.'],
        ['19%','La mayoria de bienes y servicios en Colombia.']]))
    s.append(sp(5))
    s.append(tip('Use el "Clasificador masivo IVA" en Inventario para asignar IVA a varios productos a la vez.'))
    s.append(PageBreak()); return s

# ── SECCION 8: BARBERIA ───────────────────────────────────────────────────────
def s08():
    s=[]
    s.append(SectionHeader('08','BARBERIA / PELUQUERIA / SPA',
             'Agenda de citas, sala de espera en tiempo real y comisiones'))
    s.append(sp(10))
    s.append(body('Modulo especializado para barberias, peluquerias y spas. Gestiona citas, sala de espera en vivo y comisiones de estilistas.'))
    s.append(sp(8))
    s.append(SubHeader('Agendar una cita')); s.append(sp(4))
    for n,t in [(1,'Vaya a Barberia > calendario semanal.'),
                (2,'Haga clic en el bloque de hora deseado en el dia correspondiente.'),
                (3,'Ingrese: nombre del cliente, servicio, estilista y duracion.'),
                (4,'Guarde la cita. Aparece en el calendario y la sala de espera de inmediato.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Funciones del modulo')); s.append(sp(4))
    s.append(tbl2([['Funcion','Descripcion'],
        ['Calendario semanal','Vista de agenda por dia y estilista. Navega entre semanas.'],
        ['Sala de espera','Lista en tiempo real de clientes esperando turno.'],
        ['Nuevo turno sin cita','Agrega un cliente a la cola sin cita previa.'],
        ['Comisiones','Reporte de comisiones ganadas por estilista en el periodo.'],
        ['Cobro integrado','Al finalizar el servicio, cobre directamente desde la cita.']]))
    s.append(sp(5))
    s.append(info('La sala de espera se actualiza automaticamente en todos los dispositivos. Ideal para una pantalla en recepcion.'))
    s.append(PageBreak()); return s

# ── SECCION 9: TALLER ─────────────────────────────────────────────────────────
def s09():
    s=[]
    s.append(SectionHeader('09','TALLER MECANICO',
             'Ordenes de trabajo, diagnostico, repuestos y entrega'))
    s.append(sp(10))
    s.append(body('Gestione ordenes de trabajo en un tablero Kanban: desde la recepcion del vehiculo hasta la entrega al cliente.'))
    s.append(sp(8))
    s.append(SubHeader('Crear una orden de trabajo')); s.append(sp(4))
    for n,t in [(1,'Vaya a Taller > "Nueva orden de trabajo".'),
                (2,'Ingrese: placa del vehiculo, cliente y servicio solicitado.'),
                (3,'Opcionalmente, tome fotos del estado del vehiculo al recibirlo.'),
                (4,'La orden aparece en la columna "Recibido" del tablero Kanban.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Estados del tablero Kanban')); s.append(sp(4))
    s.append(tbl2([['Columna','Estado del vehiculo'],
        ['Recibido','El vehiculo ingreso al taller. Aun no evaluado.'],
        ['Diagnostico','El tecnico esta evaluando la falla.'],
        ['Aprobado','El cliente aprobo el presupuesto. Trabajo por iniciar.'],
        ['En reparacion','El tecnico esta ejecutando el trabajo.'],
        ['Listo','Trabajo terminado. Pendiente de entrega y cobro.'],
        ['Entregado','El cliente recibio el vehiculo y pago el servicio.']]))
    s.append(sp(5))
    s.append(tip('El historial por placa permite ver todas las reparaciones previas del vehiculo con un solo clic.'))
    s.append(PageBreak()); return s

# ── SECCION 10: RESTAURANTE ───────────────────────────────────────────────────
def s10():
    s=[]
    s.append(SectionHeader('10','RESTAURANTE — GESTION DE MESAS',
             'Editor visual de mesas, estados y pantalla de cocina'))
    s.append(sp(10))
    s.append(body('Para restaurantes y cafeterias: editor visual del plano de mesas y pantalla de cocina (KDS) para gestionar pedidos en tiempo real.'))
    s.append(sp(8))
    s.append(SubHeader('Configurar el plano de mesas')); s.append(sp(4))
    for n,t in [(1,'Vaya a Restaurante > "Configurar Mesas" (solo administrador).'),
                (2,'Haga clic en "Nueva mesa". Asigne nombre, capacidad y area.'),
                (3,'Arrastre las mesas en el mapa para ubicarlas segun el plano real.'),
                (4,'Areas disponibles: Salon, Terraza, Bar, VIP, Exterior.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Estados de las mesas')); s.append(sp(4))
    s.append(tbl3([['Estado','Significado','Color indicador'],
        ['Disponible','Mesa libre y lista para recibir clientes.','Verde'],
        ['Ocupada','Hay clientes con una orden activa.','Rojo'],
        ['Reservada','Mesa reservada para un cliente proximo a llegar.','Amarillo'],
        ['En limpieza','Los clientes salieron. Preparacion en curso.','Azul']]))
    s.append(sp(8))
    s.append(SubHeader('Pantalla de cocina (KDS — Kitchen Display System)')); s.append(sp(4))
    s.append(body('La pantalla de cocina muestra todos los pedidos en tiempo real. '
                  'El cocinero puede marcar cada plato como listo sin salir de la cocina. '
                  'Acceda desde menu > "Cocina" o en el dispositivo asignado a la cocina.'))
    s.append(PageBreak()); return s

# ── SECCION 11: MINIMARKET ────────────────────────────────────────────────────
def s11():
    s=[]
    s.append(SectionHeader('11','MINIMARKET',
             'POS adaptado para tiendas de conveniencia y graneros'))
    s.append(sp(10))
    s.append(body('El modulo Minimarket adapta la interfaz del POS para el flujo de tiendas de conveniencia, papelerias, licorerías y graneros.'))
    s.append(sp(8))
    s.append(tbl2([['Funcion','Descripcion'],
        ['Cobro rapido por codigo','Escanee el codigo de barras y el producto se agrega de inmediato.'],
        ['Multiprecio','Soporte para precios mayorista y detal en el mismo producto.'],
        ['Credito a clientes','Registra ventas "fiadas" y lleva el control por cliente.'],
        ['Pedidos a proveedor','Genera pedidos de reposicion cuando el stock baja del minimo.'],
        ['Ventas a granel','Compatible con productos vendidos por peso o unidad variable.']]))
    s.append(sp(5))
    s.append(tip('Para negocios de alto volumen, conecte un escaner USB de codigo de barras para mayor velocidad de cobro.'))
    s.append(PageBreak()); return s

# ── SECCION 12: TURNOS ────────────────────────────────────────────────────────
def s12():
    s=[]
    s.append(SectionHeader('12','TURNOS Y ASISTENCIA',
             'Reloj checador digital, horas trabajadas y resumen para nomina'))
    s.append(sp(10))
    s.append(body('Funciona como reloj checador digital. Cada empleado registra entrada y salida. El administrador ve el resumen de horas y tiempos de descanso.'))
    s.append(sp(8))
    s.append(SubHeader('Como registrar entrada y salida (empleado)')); s.append(sp(4))
    for n,t in [(1,'Vaya al menu > "Turnos".'),
                (2,'Haga clic en "Registrar entrada" al comenzar la jornada.'),
                (3,'Para tomar un descanso, haga clic en "Inicio de descanso".'),
                (4,'Al regresar del descanso, haga clic en "Fin de descanso".'),
                (5,'Al terminar la jornada, haga clic en "Registrar salida".')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Vista del administrador')); s.append(sp(4))
    s.append(tbl2([['Vista','Descripcion'],
        ['Turno activo de hoy','Quien esta trabajando ahora y cuantas horas lleva.'],
        ['Historial del empleado','Todas las entradas y salidas en el periodo seleccionado.'],
        ['Resumen de horas','Total de horas trabajadas por empleado en la semana o mes.'],
        ['Horas de descanso','Tiempo de descansos separado del tiempo productivo.']]))
    s.append(sp(5))
    s.append(info('El modulo de Turnos no reemplaza la nomina, pero sirve de soporte para calcular horas extras y pago por hora.'))
    s.append(PageBreak()); return s

# ── SECCION 13: IA ────────────────────────────────────────────────────────────
def s13():
    s=[]
    s.append(SectionHeader('13','ASISTENTE DE INTELIGENCIA ARTIFICIAL',
             'Claude AI integrado: consultas rapidas y agente avanzado'))
    s.append(sp(10))
    s.append(body('FERZU POS incluye un asistente de IA (Claude AI de Anthropic) que responde preguntas sobre su negocio en lenguaje natural, en espanol.'))
    s.append(sp(8))
    s.append(SubHeader('Como acceder al asistente IA')); s.append(sp(4))
    for n,t in [(1,'Busque el boton flotante verde con el icono de IA en la esquina inferior derecha de la pantalla.'),
                (2,'Haga clic para abrir el panel de chat.'),
                (3,'Escriba su pregunta en espanol y presione Enter.'),
                (4,'El asistente responde en segundos con datos reales de su negocio.')]:
        s.append(step(n,t))
    s.append(sp(8))
    s.append(SubHeader('Dos modos de asistente')); s.append(sp(4))
    s.append(tbl3([['Modo','Velocidad','Cuando usarlo'],
        ['Consulta rapida (Haiku)','Menos de 3 segundos','Preguntas directas: ventas del dia, mejor producto, stock actual.'],
        ['Agente avanzado (Sonnet)','10-20 segundos','Analisis complejos: tendencias, proyecciones, recomendaciones.']]))
    s.append(sp(8))
    s.append(SubHeader('Ejemplos de preguntas que puede hacerle')); s.append(sp(4))
    s.append(tbl2([['Desde que modulo','Ejemplos de preguntas'],
        ['POS','Como aplico un descuento? / Como abro la caja? / Cuanto suman los productos del carrito?'],
        ['Dashboard','Como van las ventas hoy? / Cuales son mis mejores productos? / Hay alertas urgentes?'],
        ['Inventario','Que productos estan por agotarse? / Como ingreso mercancia? / Muestra alertas de stock.'],
        ['Clientes','Quienes son mis mejores clientes? / Como fidelizo clientes frecuentes?'],
        ['DIAN','Como configuro mi resolucion DIAN? / Como clasifico el IVA de mis productos?'],
        ['General','Que puedes hacer? / Como funciona FERZU POS? / Como contacto soporte?']]))
    s.append(sp(5))
    s.append(warn('El asistente IA nunca realiza cambios directos en la base de datos. Solo genera recomendaciones que usted debe aprobar.'))
    s.append(PageBreak()); return s

# ── SECCION 14: CONFIGURACION ─────────────────────────────────────────────────
def s14():
    s=[]
    s.append(SectionHeader('14','CONFIGURACION E INTEGRACIONES',
             'Ajustes del negocio, usuarios, roles y herramientas externas'))
    s.append(sp(10))
    s.append(tbl2([['Seccion','Que puede configurar'],
        ['Datos del negocio','Nombre, NIT, logo, direccion, telefono.'],
        ['Sucursales','Agregar nuevas sedes, editar datos de cada sucursal.'],
        ['Usuarios y roles','Crear empleados con diferentes permisos.'],
        ['Modulos activos','Activar o desactivar modulos segun su tipo de negocio.'],
        ['Fidelizacion','Configurar puntos por compra y reglas de redencion.'],
        ['Seguridad','PIN de bloqueo, tiempo de inactividad, historial de accesos.'],
        ['Impresora termica','Conectar y configurar la impresora ESC/POS.'],
        ['WhatsApp','Configurar el numero para envio de recibos.'],
        ['DIAN','Resolucion, prefijo y datos tributarios.'],
        ['Integraciones','Bold (datafono), Nequi, Daviplata y otras APIs.']]))
    s.append(sp(8))
    s.append(SubHeader('Roles de usuario')); s.append(sp(4))
    s.append(tbl2([['Rol','Permisos incluidos'],
        ['Administrador / Dueno','Acceso completo: configuracion, reportes, usuarios, DIAN.'],
        ['Cajero','POS, clientes. Sin acceso a reportes financieros ni configuracion.'],
        ['Solo lectura','Puede ver reportes y dashboard. No puede hacer transacciones.']]))
    s.append(sp(8))
    s.append(SubHeader('Modo sin conexion a internet (offline)')); s.append(sp(4))
    for n,t in [(1,'El sistema detecta automaticamente cuando pierde la conexion.'),
                (2,'Aparece un banner naranja: "Sin conexion — guardando localmente".'),
                (3,'Puede seguir haciendo ventas. Se guardan en el dispositivo.'),
                (4,'Cuando se restaura el internet, se sincronizan automaticamente.')]:
        s.append(step(n,t))
    s.append(sp(5))
    s.append(info('En modo offline, algunos modulos pueden estar limitados (IA, DIAN). El POS y el inventario funcionan normalmente.'))
    s.append(sp(10))
    s.append(SubHeader('Soporte y contacto')); s.append(sp(4))
    s.append(tbl2([['Canal','Como contactar'],
        ['Asistente IA en la app','Disponible en todo momento dentro de FERZU POS.'],
        ['Correo electronico','soporte@ferzu-pos.com'],
        ['WhatsApp','Numero de soporte disponible en la pagina de inicio.'],
        ['Documentacion en linea','https://ferzu-pos.vercel.app']]))
    return s

# ── BUILD ─────────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN+22, bottomMargin=MARGIN+18,
        title='FERZU POS - Guia Completa del Usuario',
        author='FERZU POS', subject='Manual de usuario FERZU POS v3.0')
    story = []
    story += cover()
    story += s01(); story += s02(); story += s03(); story += s04()
    story += s05(); story += s06(); story += s07(); story += s08()
    story += s09(); story += s10(); story += s11(); story += s12()
    story += s13(); story += s14()
    doc.build(story, onFirstPage=on_page_first, onLaterPages=on_page)
    size = os.path.getsize(OUTPUT)
    print(f"OK: {OUTPUT}  ({size//1024} KB)")

if __name__ == '__main__':
    build()
