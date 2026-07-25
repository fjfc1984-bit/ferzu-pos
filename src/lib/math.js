export function formatCOP(amount) {
  if (amount == null || isNaN(amount)) return "$0"
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(amount))
}
export function parseCOP(value) {
  if (typeof value === "number") return Math.round(value)
  const cleaned = String(value).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")
  return Math.round(parseFloat(cleaned) || 0)
}
export function calcItemSubtotal(unitPrice, qty) { return Math.round(unitPrice) * Math.round(qty) }
export function calcIVA(subtotal, ivaRate = 0.19) { return Math.round(subtotal * ivaRate) }
export function calcChange(paidAmount, totalDue) { return Math.round(paidAmount) - Math.round(totalDue) }
export function applyDiscount(price, pct) { return pct > 0 ? Math.round(price * (1 - pct/100)) : Math.round(price) }
