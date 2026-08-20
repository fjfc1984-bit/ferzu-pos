// =============================================================================
// FERZU POS — Constantes DIAN
//
// Resolución 000165 de 2023: cuando el cliente se niega a identificarse,
// la factura electrónica debe registrar el NIT genérico 222222222222
// con razón social "Consumidor Final".
// =============================================================================

export const CONSUMIDOR_FINAL = {
  id:        null,
  full_name: 'Consumidor Final',
  id_type:   'NIT',
  id_number: '222222222222',
  email:     null,
  phone:     null,
}
