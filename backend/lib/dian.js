// =============================================================================
// FERZU POS — MÓDULO DE FACTURACIÓN ELECTRÓNICA DIAN (COLOMBIA)
// Versión: 1.0.0
// Normativa: Resolución DIAN 0042/2020, UBL 2.1, Anexo Técnico 1.9
// =============================================================================
// ADVERTENCIA LEGAL:
//   Este módulo implementa el protocolo técnico según la normativa vigente.
//   Para producción, se REQUIERE un Proveedor Tecnológico Autorizado (PTA)
//   habilitado por la DIAN (ej: Siigo, Alegra, FacturaTech, Edicom).
//   Este código implementa la capa de generación del XML y el cálculo del CUFE.
//   La transmisión y firma digital la hace el PTA.
// =============================================================================
// FLUJO COMPLETO:
//   1. Orden pagada → triggerElectronicInvoice()
//   2. Backend genera XML UBL 2.1 → calculateCUFE()
//   3. Se envía XML al PTA → PTA firma y transmite a la DIAN
//   4. DIAN retorna ApplicationResponse (aceptada/rechazada)
//   5. Se guarda CUFE, XML firmado y PDF en Supabase Storage
//   6. Se envía PDF al email del cliente (opcional)
// =============================================================================

import crypto   from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// SECCIÓN 1: CONFIGURACIÓN Y CONSTANTES DIAN
// =============================================================================

// Códigos DIAN de tipo de documento
export const DIAN_DOC_TYPES = {
  CC:  '13',   // Cédula de ciudadanía
  NIT: '31',   // NIT
  CE:  '22',   // Cédula de extranjería
  PAS: '21',   // Pasaporte
  TI:  '12',   // Tarjeta de identidad
};

// Tipos de operación DIAN
export const DIAN_OPERATION_TYPES = {
  STANDARD_SALE:      '10',  // Venta estándar
  CONSIGNMENT:        '12',  // Consignación
  EXPORT:             '20',  // Exportación
};

// Códigos de impuesto DIAN
export const DIAN_TAX_CODES = {
  IVA:        '01',   // IVA
  INC:        '04',   // Impuesto Nacional al Consumo
  ICA:        '03',   // Industria y Comercio
  RETENTION:  '06',   // Retención en la fuente
};

// Ambientes DIAN
export const DIAN_ENVIRONMENTS = {
  TEST:       '2',    // Habilitación/pruebas
  PRODUCTION: '1',    // Producción
};

// URL de los esquemas UBL 2.1 DIAN
const DIAN_SCHEMAS = {
  INVOICE: 'http://www.dian.gov.co/contratos/facturaelectronica/v1',
  UBL:     'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
};


// =============================================================================
// SECCIÓN 2: CÁLCULO DEL CUFE (Código Único de Factura Electrónica)
// SHA-384 según Resolución DIAN 0042/2020, Sección 4.1
// =============================================================================

/**
 * Calcula el CUFE de una factura electrónica.
 * Fórmula: SHA384(NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 +
 *          CodImp2 + ValImp2 + CodImp3 + ValImp3 + ValTot + NitOFE +
 *          NumAdq + ClTec + TipoAmb)
 *
 * IMPORTANTE: Todos los valores numéricos van sin separador de miles,
 * con exactamente 2 decimales y punto como separador decimal.
 */
export function calculateCUFE(params) {
  const {
    invoiceNumber,      // Número de factura (ej: "SETP990000001")
    issueDate,          // Fecha emisión YYYY-MM-DD
    issueTime,          // Hora emisión HH:MM:SS-05:00
    subtotalNoVat,      // Subtotal sin IVA (número)
    vatCode1 = '01',    // Código impuesto 1 (IVA = '01')
    vatAmount1,         // Valor IVA (número)
    vatCode2 = '04',    // Código impuesto 2 (INC = '04')
    vatAmount2 = 0,     // Valor impuesto 2
    vatCode3 = '03',    // Código impuesto 3 (ICA = '03')
    vatAmount3 = 0,     // Valor impuesto 3
    grandTotal,         // Total factura (número)
    issuerNit,          // NIT del emisor sin dígito verificación
    buyerDocNumber,     // Documento del comprador (NIT o CC)
    technicalKey,       // Clave técnica asignada por la DIAN
    environment,        // '1' producción, '2' pruebas
  } = params;

  // Formatear números con exactamente 2 decimales (requisito DIAN)
  const fmt = (n) => Number(n).toFixed(2);

  const cufeConcatenation = [
    invoiceNumber,
    issueDate,
    issueTime,
    fmt(subtotalNoVat),
    vatCode1,
    fmt(vatAmount1),
    vatCode2,
    fmt(vatAmount2),
    vatCode3,
    fmt(vatAmount3),
    fmt(grandTotal),
    issuerNit,
    buyerDocNumber,
    technicalKey,
    environment,
  ].join('');

  // SHA-384 → hexadecimal lowercase
  const cufe = crypto
    .createHash('sha384')
    .update(cufeConcatenation, 'utf8')
    .digest('hex');

  return { cufe, concatenation: cufeConcatenation };
}


// =============================================================================
// SECCIÓN 3: GENERACIÓN DEL XML UBL 2.1
// Implementa el Anexo Técnico 1.9 de la DIAN
// =============================================================================

export function generateInvoiceXML(invoiceData) {
  const {
    // Emisor
    issuer,         // { nit, dv, name, tradeName, regimeType, address, city, department, phone, email }
    // Receptor
    buyer,          // { docType, docNumber, name, email, phone, address? }
    // Resolución DIAN
    resolution,     // { number, prefix, from, to, startDate, endDate }
    // Factura
    invoice,        // { number, issueDate, issueTime, dueDate, notes, currency }
    // Items
    items,          // [{ description, quantity, unitCode, unitPrice, subtotal, vatRate, vatAmount, total }]
    // Totales (calculados por el backend, NO por IA)
    totals,         // { subtotal, vatTotal, retentionTotal, grandTotal }
    // Pagos
    payments,       // [{ method, amount }]
    // Config
    environment,    // '1' | '2'
    technicalKey,
    cufe,
  } = invoiceData;

  // Formatear fecha/hora
  const issueDateTime = `${invoice.issueDate}T${invoice.issueTime}`;

  // Construir XML manualmente (sin dependencias de librerías XML para evitar vulnerabilidades)
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2
    http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${resolution.number}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${resolution.startDate}</cbc:StartDate>
              <cbc:EndDate>${resolution.endDate}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${resolution.prefix}</sts:Prefix>
              <sts:From>${resolution.from}</sts:From>
              <sts:To>${resolution.to}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${process.env.DIAN_SOFTWARE_PROVIDER_NIT}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${process.env.DIAN_SOFTWARE_ID}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${generateSoftwareSecurityCode(issuer.nit, invoice.number)}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeID="4" schemeName="IdentificacionFiscal">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${generateQRContent(cufe, invoice.number, totals.grandTotal)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <!-- Espacio reservado para la firma digital XAdES-BES (el PTA la inserta) -->
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ProfileExecutionID>${environment}</cbc:ProfileExecutionID>
  <cbc:ID>${resolution.prefix}${invoice.number}</cbc:ID>
  <cbc:UUID schemeID="${environment}" schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:DueDate>${invoice.dueDate || invoice.issueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode listAgencyID="195" listAgencyName="CO, DIAN" listID="10" listName="Tipo de Documento" listSchemeURI="dian:gov:co:facturaelectronica:TypeList">01</cbc:InvoiceTypeCode>
  <cbc:Note>${escapeXml(invoice.notes || '')}</cbc:Note>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>

  <!-- ─── EMISOR ────────────────────────────────────────────────────────────── -->
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>${issuer.regimeType === 'common' ? '1' : '2'}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(issuer.tradeName || issuer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:ID>${issuer.cityCode}</cbc:ID>
          <cbc:CityName>${escapeXml(issuer.city)}</cbc:CityName>
          <cbc:CountrySubentity>${escapeXml(issuer.department)}</cbc:CountrySubentity>
          <cac:AddressLine><cbc:Line>${escapeXml(issuer.address)}</cbc:Line></cac:AddressLine>
          <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(issuer.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195" schemeAgencyName="CO, DIAN" schemeID="${issuer.dv}" schemeName="31">${issuer.nit}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="${issuer.regimeType === 'common' ? 'No aplica' : 'No aplica'}">${issuer.regimeType === 'common' ? 'O-13' : 'O-47'}</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:ElectronicMail>${issuer.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- ─── RECEPTOR ─────────────────────────────────────────────────────────── -->
  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${buyer.docType === '31' ? '1' : '2'}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(buyer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:CityName>${escapeXml(buyer.city || issuer.city)}</cbc:CityName>
          <cac:AddressLine><cbc:Line>${escapeXml(buyer.address || 'No especificada')}</cbc:Line></cac:AddressLine>
          <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(buyer.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195" schemeAgencyName="CO, DIAN" schemeID="${buyer.dv || '0'}" schemeName="${DIAN_DOC_TYPES[buyer.docType] || buyer.docType}">${buyer.docNumber}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="No aplica">R-99-PN</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>ZZ</cbc:ID>
          <cbc:Name>No aplica</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:ElectronicMail>${buyer.email || ''}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- ─── MÉTODO DE PAGO ───────────────────────────────────────────────────── -->
  <cac:PaymentMeans>
    <cbc:ID>${getPaymentMeansCode(payments[0]?.method)}</cbc:ID>
    <cbc:PaymentMeansCode>${getPaymentMeansCode(payments[0]?.method)}</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${invoice.dueDate || invoice.issueDate}</cbc:PaymentDueDate>
  </cac:PaymentMeans>

  <!-- ─── IMPUESTOS TOTALES ────────────────────────────────────────────────── -->
${totals.vatTotal > 0 ? `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${Number(totals.vatTotal).toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${Number(totals.subtotal).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${Number(totals.vatTotal).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>` : `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">0.00</cbc:TaxAmount>
  </cac:TaxTotal>`}

  <!-- ─── TOTALES MONETARIOS ───────────────────────────────────────────────── -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${Number(totals.subtotal).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${Number(totals.subtotal).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${Number(totals.grandTotal).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="COP">0.00</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="COP">${Number(totals.grandTotal).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- ─── LÍNEAS DE FACTURA ────────────────────────────────────────────────── -->
${items.map((item, idx) => generateInvoiceLineXML(item, idx + 1)).join('\n')}

</Invoice>`;

  return xml;
}

// Generar XML de una línea de factura
function generateInvoiceLineXML(item, lineNumber) {
  return `  <cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unitCode || 'EA'}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyID="6">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${Number(item.subtotal).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:FreeOfChargeIndicator>false</cbc:FreeOfChargeIndicator>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="COP">${Number(item.vatAmount || 0).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="COP">${Number(item.subtotal).toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="COP">${Number(item.vatAmount || 0).toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${Number(item.vatRate || 0).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>01</cbc:ID>
            <cbc:Name>IVA</cbc:Name>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(item.description)}</cbc:Description>
      <cac:StandardItemIdentification>
        <cbc:ID schemeID="999" schemeName="Estándar de adopción del contribuyente">${item.sku || lineNumber}</cbc:ID>
      </cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${Number(item.unitPrice).toFixed(2)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="${item.unitCode || 'EA'}">${item.quantity}</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`;
}


// =============================================================================
// SECCIÓN 4: HELPERS
// =============================================================================

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

// Código software security code (SHA-384 de NIT + número factura + pin técnico)
function generateSoftwareSecurityCode(nit, invoiceNumber) {
  const pin = process.env.DIAN_SOFTWARE_PIN;
  return crypto
    .createHash('sha384')
    .update(`${nit}${invoiceNumber}${pin}`, 'utf8')
    .digest('hex');
}

// Contenido del código QR (enlace de verificación DIAN)
function generateQRContent(cufe, invoiceNumber, grandTotal) {
  const env = process.env.DIAN_ENVIRONMENT === '1' ? 'consulta' : 'habilitacion';
  return `https://${env}.dian.gov.co/numhab/` +
         `?DocumentKey=${invoiceNumber}&SecurityCode=${cufe.substring(0, 8)}&Amount=${grandTotal}`;
}

// Mapear método de pago FERZU → código DIAN
function getPaymentMeansCode(method) {
  const map = {
    cash:         '10',  // Efectivo
    card_debit:   '49',  // Tarjeta débito
    card_credit:  '48',  // Tarjeta crédito
    nequi:        '1',   // Instrumento no definido (billetera digital)
    daviplata:    '1',
    transfer:     '42',  // Transferencia
    other:        '1',
  };
  return map[method] || '1';
}


// =============================================================================
// SECCIÓN 5: ORQUESTADOR PRINCIPAL (triggerElectronicInvoice)
// Se llama desde el backend cuando una orden es marcada como "paid"
// y la organización tiene facturación electrónica activa
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function triggerElectronicInvoice(orderId, organizationId) {
  try {
    // ── 1. Verificar que la organización tiene FE activa ──────────────────────
    const { data: dianConfig } = await supabaseAdmin
      .from('dian_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (!dianConfig) return; // FE no configurada → no emitir

    // ── 2. Cargar datos de la orden ───────────────────────────────────────────
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select(`
        *, branches(*, organizations(*)),
        order_items(*, products(name, sku, vat_rate)),
        payments(*),
        customers(*)
      `)
      .eq('id', orderId)
      .single();

    if (!order) throw new Error(`Orden ${orderId} no encontrada`);

    const org    = order.branches.organizations;
    const branch = order.branches;

    // ── 3. Obtener número de factura siguiente (atómico) ──────────────────────
    const { data: numData } = await supabaseAdmin.rpc('get_next_invoice_number', {
      p_organization_id: organizationId
    });
    const invoiceNumber = numData; // La función SQL es ATOMIC (SELECT + UPDATE en transacción)

    // ── 4. Preparar datos del comprador ───────────────────────────────────────
    const buyer = prepareBuyer(order.customers);

    // ── 5. Preparar ítems (los totales ya están calculados en el backend) ─────
    const items = order.order_items.map(item => ({
      description: item.product_name,
      sku:         item.product_sku,
      quantity:    item.quantity,
      unitCode:    'EA',
      unitPrice:   item.unit_price,
      subtotal:    item.subtotal,
      vatRate:     item.vat_rate,
      vatAmount:   item.vat_amount,
    }));

    const totals = {
      subtotal:   order.subtotal,
      vatTotal:   order.tax_total,
      grandTotal: order.total,
    };

    // ── 6. Calcular CUFE ──────────────────────────────────────────────────────
    const issueDate = new Date().toISOString().split('T')[0];
    const issueTime = new Date().toLocaleTimeString('en-US', {
      hour12: false, timeZone: 'America/Bogota'
    }) + '-05:00';

    const { cufe } = calculateCUFE({
      invoiceNumber: `${dianConfig.resolution_prefix}${invoiceNumber}`,
      issueDate,
      issueTime,
      subtotalNoVat: order.subtotal,
      vatCode1:      '01',
      vatAmount1:    order.tax_total,
      vatCode2:      '04',
      vatAmount2:    0,
      vatCode3:      '03',
      vatAmount3:    0,
      grandTotal:    order.total,
      issuerNit:     org.nit,
      buyerDocNumber: buyer.docNumber || '222222222222',
      technicalKey:  dianConfig.api_key,
      environment:   dianConfig.environment === 'production'
        ? DIAN_ENVIRONMENTS.PRODUCTION
        : DIAN_ENVIRONMENTS.TEST,
    });

    // ── 7. Generar XML UBL 2.1 ────────────────────────────────────────────────
    const xmlString = generateInvoiceXML({
      issuer: {
        nit:         org.nit,
        dv:          org.nit_dv,
        name:        org.legal_name || org.name,
        tradeName:   org.name,
        regimeType:  org.tax_regime,
        address:     branch.address,
        city:        branch.city,
        cityCode:    '11001',  // TODO: lookup from branch.city
        department:  branch.department,
        email:       org.email,
      },
      buyer,
      resolution: {
        number:    dianConfig.resolution_number,
        prefix:    dianConfig.resolution_prefix,
        from:      dianConfig.resolution_from,
        to:        dianConfig.resolution_to,
        startDate: dianConfig.resolution_date,
        endDate:   dianConfig.resolution_expires_at,
      },
      invoice: {
        number:    invoiceNumber,
        issueDate, issueTime,
        dueDate:   issueDate,
        notes:     `Gracias por su compra en ${org.name}`,
        currency:  'COP',
      },
      items, totals,
      payments: order.payments,
      environment: dianConfig.environment === 'production'
        ? DIAN_ENVIRONMENTS.PRODUCTION
        : DIAN_ENVIRONMENTS.TEST,
      technicalKey: dianConfig.api_key,
      cufe,
    });

    // ── 8. Crear registro en BD ───────────────────────────────────────────────
    const fullInvoiceNumber = `${dianConfig.resolution_prefix}${invoiceNumber}`;
    const { data: einvoice } = await supabaseAdmin.from('electronic_invoices').insert({
      organization_id: organizationId,
      order_id:        orderId,
      invoice_prefix:  dianConfig.resolution_prefix,
      invoice_number:  fullInvoiceNumber,
      cufe,
      invoice_type:    'FV',
      dian_status:     'pending',
      issued_at:       new Date().toISOString(),
      customer_name:   buyer.name,
      customer_nit:    buyer.docNumber,
      customer_email:  buyer.email,
      subtotal:        order.subtotal,
      tax_total:       order.tax_total,
      total:           order.total,
    }).select().single();

    // ── 9. Guardar XML en Supabase Storage ────────────────────────────────────
    const xmlBuffer = Buffer.from(xmlString, 'utf8');
    const xmlPath   = `invoices/${organizationId}/${fullInvoiceNumber}.xml`;

    await supabaseAdmin.storage
      .from('electronic-invoices')
      .upload(xmlPath, xmlBuffer, { contentType: 'application/xml', upsert: true });

    await supabaseAdmin.from('electronic_invoices')
      .update({ xml_url: xmlPath, sent_at: new Date().toISOString(), dian_status: 'sending' })
      .eq('id', einvoice.id);

    // ── 10. Enviar al Proveedor Tecnológico Autorizado (PTA) ──────────────────
    const ptaResponse = await sendToPTA(xmlString, fullInvoiceNumber, dianConfig);

    // ── 11. Procesar respuesta del PTA / DIAN ─────────────────────────────────
    if (ptaResponse.success) {
      await supabaseAdmin.from('electronic_invoices').update({
        dian_status:   'accepted',
        accepted_at:   new Date().toISOString(),
        dian_response: ptaResponse.response,
        pdf_url:       ptaResponse.pdf_url,
      }).eq('id', einvoice.id);

      // Enviar PDF al cliente si tiene email
      if (buyer.email) {
        await sendInvoiceByEmail(buyer.email, buyer.name, ptaResponse.pdf_url, fullInvoiceNumber, org.name);
      }

      return { success: true, invoiceNumber: fullInvoiceNumber, cufe };
    } else {
      await supabaseAdmin.from('electronic_invoices').update({
        dian_status: 'rejected',
        dian_errors: ptaResponse.errors,
      }).eq('id', einvoice.id);

      // Crear alerta
      await supabaseAdmin.from('system_alerts').insert({
        organization_id: organizationId,
        alert_type:      'dian_rejection',
        severity:        'high',
        title:           `Factura ${fullInvoiceNumber} rechazada por la DIAN`,
        description:     JSON.stringify(ptaResponse.errors),
      });

      return { success: false, errors: ptaResponse.errors };
    }

  } catch (err) {
    console.error('Error en facturación electrónica:', err);

    // ── CONTINGENCIA: Si falla el envío, marcar para reenvío posterior ────────
    await supabaseAdmin.from('electronic_invoices').update({
      dian_status: 'contingency',
    }).eq('order_id', orderId);

    throw err;
  }
}

// Helper: Preparar datos del comprador desde el cliente de la orden
function prepareBuyer(customer) {
  if (!customer) {
    // Consumidor final (sin datos)
    return {
      docType:   '13',
      docNumber: '222222222222',
      dv:        '0',
      name:      'Consumidor final',
      email:     null,
      address:   'No especificada',
      city:      'Bogotá',
    };
  }

  return {
    docType:   DIAN_DOC_TYPES[customer.document_type] || '13',
    docNumber: customer.document_number,
    dv:        '0',
    name:      `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email,
    email:     customer.email,
    phone:     customer.phone,
    address:   customer.address || 'No especificada',
    city:      customer.city || 'Bogotá',
  };
}

// Helper: Enviar al PTA (Proveedor Tecnológico Autorizado)
async function sendToPTA(xmlString, invoiceNumber, dianConfig) {
  const provider = dianConfig.provider;

  switch (provider) {
    case 'alegra': {
      // Integración con Alegra API
      const response = await axios.post(
        'https://api.alegra.com/api/v1/invoice-electronic/send',
        { xml: Buffer.from(xmlString).toString('base64'), invoiceNumber },
        { headers: {
          Authorization: `Basic ${Buffer.from(dianConfig.api_key).toString('base64')}`,
          'Content-Type': 'application/json'
        }}
      );
      return { success: true, response: response.data, pdf_url: response.data.pdf_url };
    }

    case 'siigo': {
      // Integración con Siigo API
      const tokenRes = await axios.post('https://api.siigo.com/auth/access-keys', {
        partner_id: process.env.SIIGO_PARTNER_ID,
        access_key: dianConfig.api_key,
      });
      const siigoToken = tokenRes.data.access_token;
      const invRes = await axios.post(
        'https://api.siigo.com/v1/invoices',
        parseXMLToSiigoFormat(xmlString),
        { headers: { Authorization: `Bearer ${siigoToken}` } }
      );
      return { success: true, response: invRes.data, pdf_url: invRes.data.pdf?.download_url };
    }

    case 'custom': {
      // PTA propio — enviar XML directamente
      const response = await axios.post(
        `${dianConfig.api_key}/send-invoice`,
        { xml: xmlString, number: invoiceNumber },
        { headers: { 'X-API-Key': dianConfig.api_secret } }
      );
      return response.data;
    }

    default:
      throw new Error(`Proveedor PTA no soportado: ${provider}`);
  }
}

// Helper: Enviar factura por email
async function sendInvoiceByEmail(email, name, pdfUrl, invoiceNumber, businessName) {
  // Integrar con servicio de email (Resend, SendGrid, etc.)
  // Por ahora, solo log
  console.log(`📧 Enviar factura ${invoiceNumber} a ${email}`);
}

// Función SQL para obtener siguiente número de factura (atómica)
// Agregar al schema SQL:
/*
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_organization_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_current INTEGER;
BEGIN
  SELECT current_number INTO v_current
  FROM dian_configs
  WHERE organization_id = p_organization_id
  FOR UPDATE;                          -- Lock para evitar concurrencia

  UPDATE dian_configs
  SET current_number = current_number + 1
  WHERE organization_id = p_organization_id;

  RETURN v_current;
END;
$$ LANGUAGE plpgsql;
*/


// =============================================================================
// SECCIÓN 6: NOTA DE CRÉDITO (cuando hay devolución)
// =============================================================================

export async function generateCreditNote(orderId, refundId, organizationId) {
  const { data: originalInvoice } = await supabaseAdmin
    .from('electronic_invoices')
    .select('*')
    .eq('order_id', orderId)
    .eq('dian_status', 'accepted')
    .single();

  if (!originalInvoice) {
    throw new Error('No existe factura electrónica aceptada para esta orden');
  }

  const { data: refund } = await supabaseAdmin
    .from('refunds')
    .select('*')
    .eq('id', refundId)
    .single();

  // La nota crédito referencia la factura original con el CUFE
  // Códigos de concepto DIAN para nota crédito:
  // 1=Devolución parcial de bienes, 2=Anulación, 3=Rebaja, etc.
  const creditNoteXML = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">

  <cbc:ID>NC-${refundId.substring(0, 8).toUpperCase()}</cbc:ID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cbc:DiscrepancyResponseCode>1</cbc:DiscrepancyResponseCode>
  <cbc:DiscrepancyResponseDescription>${escapeXml(refund.reason)}</cbc:DiscrepancyResponseDescription>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>

  <!-- Referencia a la factura original -->
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${originalInvoice.invoice_number}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${originalInvoice.cufe}</cbc:UUID>
      <cbc:IssueDate>${originalInvoice.issued_at.split('T')[0]}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>

  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="COP">${Number(refund.amount).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

</CreditNote>`;

  return creditNoteXML;
}


// =============================================================================
// SECCIÓN 7: VERIFICACIÓN DE RESOLUCIÓN DIAN (alertas de vencimiento)
// =============================================================================

export async function checkResolutionExpiry(organizationId) {
  const { data: config } = await supabaseAdmin
    .from('dian_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single();

  if (!config) return;

  const today       = new Date();
  const expiry      = new Date(config.resolution_expires_at);
  const daysToExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  const rangeUsed   = config.current_number - config.resolution_from;
  const rangeTotal  = config.resolution_to - config.resolution_from + 1;
  const rangeLeft   = rangeTotal - rangeUsed;

  const alerts = [];

  // Alerta: resolución vence en menos de 30 días
  if (daysToExpiry <= 30 && daysToExpiry > 0) {
    alerts.push({
      organization_id: organizationId,
      alert_type:      'dian_resolution_expiry',
      severity:        daysToExpiry <= 7 ? 'critical' : 'high',
      title:           `Resolución DIAN vence en ${daysToExpiry} días`,
      description:     `La resolución ${config.resolution_number} vence el ${expiry.toLocaleDateString('es-CO')}. Tramita la renovación.`,
      data:            { days_remaining: daysToExpiry, expires_at: config.resolution_expires_at },
    });
  }

  // Alerta: quedan menos de 100 números de factura
  if (rangeLeft <= 100) {
    alerts.push({
      organization_id: organizationId,
      alert_type:      'dian_range_exhausting',
      severity:        rangeLeft <= 20 ? 'critical' : 'high',
      title:           `Solo quedan ${rangeLeft} números de factura`,
      description:     `La resolución ${config.resolution_number} va desde ${config.resolution_from} hasta ${config.resolution_to}. Número actual: ${config.current_number}.`,
      data:            { range_left: rangeLeft, current_number: config.current_number },
    });
  }

  if (alerts.length) {
    await supabaseAdmin.from('system_alerts').insert(alerts);
  }

  return { daysToExpiry, rangeLeft, alerts };
}
