// ferzu_claude_tools.js — Re-exporta todo desde lib/claudeTools.js
// server.js importa desde aquí para mantener la ruta original limpia
export { runFerzuAgent, FERZU_TOOLS, FERZU_SYSTEM_PROMPT } from './lib/claudeTools.js';

// executeApprovedProposal — se expone aquí para que server.js pueda importarla
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function executeApprovedProposal(proposalId, userId, context) {
  const { supabase = supabaseAdmin } = context;

  const { data: proposal, error } = await supabase
    .from('ai_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (error || !proposal) throw new Error('Propuesta no encontrada');
  if (proposal.status !== 'pending') throw new Error(`Propuesta ya ${proposal.status}`);

  let affectedRecords = [];

  try {
    switch (proposal.proposal_type) {

      case 'inventory_entry':
        for (const item of proposal.payload.items) {
          // Backend calcula el costo promedio ponderado (nunca la IA)
          const { data: inv } = await supabase
            .from('inventory')
            .select('quantity, average_cost')
            .eq('branch_id', context.branch_id)
            .eq('product_id', item.product_id)
            .single();

          const newQty      = (inv?.quantity || 0) + item.quantity;
          const newAvgCost  = inv && inv.quantity > 0
            ? Math.round((inv.average_cost * inv.quantity + item.unit_cost * item.quantity) / newQty)
            : Math.round(item.unit_cost);

          await supabase.from('inventory_movements').insert({
            branch_id: context.branch_id,
            product_id: item.product_id,
            movement_type: 'purchase',
            quantity: item.quantity,
            unit_cost: Math.round(item.unit_cost),
            reference_type: 'ai_proposal',
            reference_id: proposalId,
            created_by: userId,
          });

          await supabase.from('inventory').upsert({
            branch_id:    context.branch_id,
            product_id:   item.product_id,
            quantity:     newQty,
            last_cost:    Math.round(item.unit_cost),
            average_cost: newAvgCost,
            updated_at:   new Date().toISOString(),
          });

          affectedRecords.push({ table: 'inventory', product_id: item.product_id, new_qty: newQty });
        }
        break;

      case 'purchase_order':
        const { data: po } = await supabase.from('purchase_orders').insert({
          branch_id:       context.branch_id,
          supplier_id:     proposal.payload.supplier_id,
          order_number:    `PO-${Date.now()}`,
          status:          'draft',
          source:          'ai_suggested',
          ai_proposal_id:  proposalId,
          expected_at:     proposal.payload.expected_at,
          created_by:      userId,
        }).select().single();

        for (const item of proposal.payload.items) {
          const subtotal  = Math.round(item.quantity * item.unit_cost);
          const vatAmount = Math.round(subtotal * (item.vat_rate || 0) / 100);
          await supabase.from('purchase_order_items').insert({
            purchase_order_id: po.id,
            product_id: item.product_id,
            quantity_ordered: item.quantity,
            unit_cost:    Math.round(item.unit_cost),
            vat_rate:     item.vat_rate || 0,
            subtotal,
            tax_amount:   vatAmount,
            total:        subtotal + vatAmount,
          });
        }
        affectedRecords.push({ table: 'purchase_orders', id: po.id });
        break;

      case 'stock_adjustment':
        for (const item of proposal.payload.items) {
          const { data: inv } = await supabase.from('inventory')
            .select('quantity').eq('branch_id', context.branch_id).eq('product_id', item.product_id).single();
          const newQty = Math.max(0, (inv?.quantity || 0) + item.quantity_delta);
          await supabase.from('inventory').update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('branch_id', context.branch_id).eq('product_id', item.product_id);
          await supabase.from('inventory_movements').insert({
            branch_id: context.branch_id, product_id: item.product_id,
            movement_type: item.quantity_delta < 0 ? 'waste' : 'adjustment',
            quantity: item.quantity_delta, notes: item.reason,
            reference_type: 'ai_proposal', reference_id: proposalId, created_by: userId,
          });
          affectedRecords.push({ table: 'inventory', product_id: item.product_id, new_qty: newQty });
        }
        break;

      case 'discount': {
        const orderId = proposal.payload.order_id;
        // SECURITY: orders no tiene organization_id — verificar via su branch.
        // El endpoint que aprueba la propuesta ya valida que la PROPUESTA sea de
        // esta org, pero payload.order_id lo puso la IA y puede apuntar a CUALQUIER
        // orden (p.ej. si el usuario le pidió aplicar descuento a un UUID ajeno,
        // conocido vía el link público de recibo). Sin esto se descontaría el
        // pedido de otro negocio.
        const { data: targetOrder } = await supabase
          .from('orders')
          .select('id, branches!inner(organization_id)')
          .eq('id', orderId)
          .eq('branches.organization_id', context.organization_id)
          .maybeSingle();
        if (!targetOrder) throw new Error('Orden no encontrada o no pertenece a esta organización');

        await supabase.from('orders').update({
          discount_type:   proposal.payload.discount_type,
          discount_value:  proposal.payload.discount_value,
        }).eq('id', orderId);
        affectedRecords.push({ table: 'orders', id: orderId });
        break;
      }

      case 'price_update': {
        const productId = proposal.payload.product_id;
        // SECURITY: mismo riesgo que 'discount' — verificar que el producto sea de esta org.
        const { data: targetProduct } = await supabase
          .from('products')
          .select('id')
          .eq('id', productId)
          .eq('organization_id', context.organization_id)
          .maybeSingle();
        if (!targetProduct) throw new Error('Producto no encontrado o no pertenece a esta organización');

        await supabase.from('products').update({
          price: Math.round(proposal.payload.new_price),
          updated_at: new Date().toISOString(),
        }).eq('id', productId);
        affectedRecords.push({ table: 'products', id: productId });
        break;
      }

      default:
        throw new Error(`proposal_type desconocido: ${proposal.proposal_type}`);
    }

    // Marcar como ejecutada
    await supabase.from('ai_proposals').update({
      status: 'executed',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', proposalId);

    // Log de auditoría
    await supabase.from('audit_log').insert({
      organization_id: context.organization_id,
      user_id: userId,
      action: 'approve',
      table_name: 'ai_proposals',
      record_id: proposalId,
      new_values: { proposal_type: proposal.proposal_type, status: 'executed' },
    });

    return { success: true, affected_records: affectedRecords };

  } catch (err) {
    await supabase.from('ai_proposals').update({ status: 'failed' }).eq('id', proposalId);
    throw err;
  }
}
