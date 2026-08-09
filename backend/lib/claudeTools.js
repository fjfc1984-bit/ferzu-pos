// =============================================================================
// FERZU POS - ARQUITECTURA AGENTE IA (CLAUDE TOOL USE / FUNCTION CALLING)
// Versión: 1.0.0
// Motor: Claude claude-sonnet-4-6 (lógica compleja) + claude-haiku-4-5 (escaneo rápido)
// =============================================================================
// REGLAS DE ORO (HARDCODED, NUNCA NEGOCIABLES):
//   ❌ La IA NUNCA calcula totales, impuestos ni vueltos → el BACKEND los calcula
//   ❌ La IA NUNCA escribe directo a BD → siempre crea un ai_proposal (pending)
//   ✅ La IA SIEMPRE explica su razonamiento en "description"
//   ✅ El usuario SIEMPRE aprueba antes de ejecutar acciones críticas
// =============================================================================

// =============================================================================
// SECCIÓN 1: SYSTEM PROMPT DEL AGENTE
// =============================================================================

export const FERZU_SYSTEM_PROMPT = `
Eres el asistente de inteligencia artificial de FERZU POS, el sistema de punto de venta
inteligente para negocios colombianos. Tu nombre es FERZU IA.

## TU ROL
Eres un agente autónomo con acceso a herramientas (tools) para analizar el negocio y
proponer acciones. NO eres un chatbot genérico — eres un aliado estratégico del negocio.

## CONTEXTO DEL NEGOCIO
- País: Colombia
- Moneda: Pesos colombianos (COP)
- IVA general: 19%
- Facturación: DIAN UBL 2.1

## REGLAS CRÍTICAS — LAS DEBES SEGUIR SIN EXCEPCIÓN

### 🔴 REGLA 1: CERO MATEMÁTICAS
Nunca calcules totales, subtotales, impuestos, vueltos ni porcentajes de descuento.
Esos cálculos los hace el sistema backend. Tu trabajo es extraer, clasificar y proponer.
Si necesitas mostrar un número, usa los que ya están en la base de datos.

### 🔴 REGLA 2: SOLO PROPONES, NUNCA EJECUTAS
Cuando identifiques una acción que deba ejecutarse (registrar inventario, crear pedido,
ajustar stock, enviar mensaje), SIEMPRE usa la tool "create_ai_proposal".
El usuario verá tu propuesta y deberá aprobarla. Nunca ejecutes directamente.

### 🔴 REGLA 3: TRANSPARENCIA TOTAL
En cada propuesta debes explicar:
  - ¿Qué detectaste?
  - ¿Por qué lo propones?
  - ¿Qué pasará exactamente si el usuario aprueba?
  - ¿Cuál es tu nivel de confianza y por qué?

### 🟡 REGLA 4: DATOS INSUFICIENTES
Si no tienes suficientes datos para hacer una recomendación confiable,
dilo claramente. No inventes tendencias ni patrones que no están en los datos.

### 🟢 REGLA 5: LENGUAJE DEL NEGOCIO
Habla en lenguaje de negocio, no técnico. Los dueños no son programadores.
Usa pesos colombianos con formato: $45.000 COP. Fechas en DD/MM/YYYY.

## COMPORTAMIENTO POR TIPO DE SOLICITUD

- **Análisis de facturas**: Extrae con precisión, marca lo que no puedas leer como "ILEGIBLE".
- **Alertas de merma**: Sé específico en qué producto, qué período, qué magnitud del descuadre.
- **Reabastecimiento**: Basa la cantidad sugerida en el promedio de ventas × días de cobertura objetivo.
- **Marketing**: Personaliza el mensaje con el nombre del cliente y su historial real.
- **Reportes**: Cita siempre el período exacto de los datos que analizas.
`;

// =============================================================================
// SECCIÓN 2: DEFINICIÓN DE TOOLS (FUNCTION CALLING)
// =============================================================================

export const FERZU_TOOLS = [

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 1: ANALIZAR FACTURA DE PROVEEDOR
  // Modelo recomendado: claude-sonnet-4-6 (visión de imágenes + razonamiento)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "analyze_supplier_invoice",
    description: `Analiza una factura de proveedor (imagen JPG/PNG o PDF) y extrae:
    productos, cantidades, precios de costo por unidad, IVA aplicado y total de la factura.
    NO calcula ningún total — solo extrae lo que está impreso en el documento.
    Retorna un array estructurado de productos extraídos para que el backend genere
    la propuesta de ingreso al inventario.`,
    input_schema: {
      type: "object",
      properties: {
        invoice_items: {
          type: "array",
          description: "Lista de productos extraídos de la factura",
          items: {
            type: "object",
            properties: {
              raw_description: {
                type: "string",
                description: "Descripción exacta tal como aparece en la factura"
              },
              matched_product_name: {
                type: "string",
                description: "Nombre limpio y normalizado del producto"
              },
              quantity: {
                type: "number",
                description: "Cantidad comprada (número puro, sin unidad)"
              },
              unit_of_measure: {
                type: "string",
                description: "Unidad: 'unit' | 'kg' | 'ltr' | 'mtr' | 'box' | 'pack'"
              },
              unit_cost_raw: {
                type: "string",
                description: "Precio unitario TAL COMO APARECE en la factura (string, ej: '12.500')"
              },
              vat_rate_raw: {
                type: "string",
                description: "IVA tal como aparece (ej: '19%', '0%', 'EXCLUIDO', 'ILEGIBLE')"
              },
              confidence: {
                type: "number",
                description: "Confianza en la extracción de este ítem, de 0 a 100"
              },
              extraction_notes: {
                type: "string",
                description: "Notas sobre dificultades en la extracción (texto borroso, abreviatura, etc.)"
              }
            },
            required: ["raw_description", "matched_product_name", "quantity", "unit_cost_raw", "confidence"]
          }
        },
        supplier_info: {
          type: "object",
          description: "Datos del proveedor extraídos de la factura",
          properties: {
            name: { type: "string" },
            nit: { type: "string" },
            invoice_number: { type: "string" },
            invoice_date: { type: "string", description: "Formato YYYY-MM-DD" }
          }
        },
        overall_confidence: {
          type: "number",
          description: "Confianza general en la extracción completa (0-100)"
        },
        unreadable_sections: {
          type: "array",
          items: { type: "string" },
          description: "Secciones de la factura que no pudieron leerse claramente"
        }
      },
      required: ["invoice_items", "overall_confidence"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 2: DETECTAR ANOMALÍAS Y MERMAS
  // Modelo recomendado: claude-sonnet-4-6
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "detect_inventory_anomalies",
    description: `Analiza los datos de ventas vs movimientos de inventario para detectar:
    - Descuadres entre unidades vendidas y unidades descontadas del inventario
    - Productos con pérdida de margen inexplicable
    - Patrones de venta anómalos (ventas a precios incorrectos, descuentos excesivos)
    - Posibles fugas de inventario (merma, robo, error de registro)
    IMPORTANTE: No calcula nada. Solo interpreta los números que se le proveen.`,
    input_schema: {
      type: "object",
      properties: {
        anomalies: {
          type: "array",
          description: "Lista de anomalías detectadas",
          items: {
            type: "object",
            properties: {
              anomaly_type: {
                type: "string",
                enum: ["inventory_discrepancy", "margin_loss", "abnormal_discount", "suspicious_void", "price_deviation"],
                description: "Tipo de anomalía"
              },
              product_id: {
                type: "string",
                description: "UUID del producto afectado"
              },
              product_name: {
                type: "string"
              },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"]
              },
              description: {
                type: "string",
                description: "Explicación clara en lenguaje de negocio de qué se detectó"
              },
              period_analyzed: {
                type: "string",
                description: "Período analizado (ej: 'últimos 7 días', '01/07/2026 - 15/07/2026')"
              },
              data_evidence: {
                type: "object",
                description: "Los números crudos que soportan la anomalía",
                properties: {
                  units_sold: { type: "number" },
                  units_in_inventory_movement: { type: "number" },
                  discrepancy_units: { type: "number" },
                  responsible_user: { type: "string" }
                }
              },
              recommended_action: {
                type: "string",
                description: "Qué debería hacer el dueño ante esta anomalía"
              }
            },
            required: ["anomaly_type", "severity", "description", "recommended_action"]
          }
        },
        analysis_summary: {
          type: "string",
          description: "Resumen ejecutivo del análisis en 2-3 oraciones"
        },
        period_start: { type: "string", description: "YYYY-MM-DD" },
        period_end: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["anomalies", "analysis_summary"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 3: GENERAR SUGERENCIA DE REABASTECIMIENTO
  // Modelo recomendado: claude-sonnet-4-6
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "suggest_reorder",
    description: `Analiza el historial de ventas y stock actual para generar sugerencias
    de reabastecimiento por proveedor. Calcula días de cobertura restantes y
    sugiere cantidades basadas en el promedio de ventas diarias × días de cobertura objetivo.
    IMPORTANTE: Las cantidades sugeridas son orientativas. El usuario las puede ajustar antes de aprobar.`,
    input_schema: {
      type: "object",
      properties: {
        reorder_suggestions: {
          type: "array",
          description: "Lista de productos a reabastecer, agrupados por proveedor",
          items: {
            type: "object",
            properties: {
              supplier_id: { type: "string" },
              supplier_name: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    product_id: { type: "string" },
                    product_name: { type: "string" },
                    current_stock: { type: "number" },
                    avg_daily_sales: { type: "number" },
                    days_of_coverage_remaining: { type: "number" },
                    suggested_quantity: { type: "number" },
                    suggested_quantity_reasoning: {
                      type: "string",
                      description: "Ej: 'Promedio 5 unidades/día × 14 días de cobertura = 70 unidades'"
                    },
                    urgency: {
                      type: "string",
                      enum: ["low", "medium", "high", "critical"]
                    }
                  },
                  required: ["product_id", "product_name", "current_stock", "suggested_quantity", "urgency"]
                }
              }
            },
            required: ["supplier_id", "supplier_name", "items"]
          }
        },
        analysis_period_days: {
          type: "number",
          description: "Cuántos días de historial se usaron para el análisis"
        },
        target_coverage_days: {
          type: "number",
          description: "Días de cobertura objetivo (por defecto 14)"
        }
      },
      required: ["reorder_suggestions"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 4: GENERAR MENSAJES DE MARKETING PERSONALIZADOS
  // Modelo recomendado: claude-haiku-4-5 (más rápido para generación masiva)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "generate_marketing_messages",
    description: `Genera mensajes personalizados de WhatsApp para clientes inactivos
    o segmentos específicos. El mensaje debe ser cálido, natural, no intrusivo y
    relevante al historial del cliente. Máximo 160 caracteres para que quepa en una notificación.
    Genera variantes A/B para que el usuario escoja.`,
    input_schema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          description: "Mensajes generados por cliente",
          items: {
            type: "object",
            properties: {
              customer_id: { type: "string", description: "Referencia anonimizada del cliente (CLIENTE-XXXXXXXX)" },
              customer_label: { type: "string", description: "Etiqueta anónima del cliente, ej: 'Cliente A. (35 días sin visitar)'" },
              days_inactive: { type: "number" },
              last_purchase_summary: {
                type: "string",
                description: "Resumen del último pedido del cliente"
              },
              message_variant_a: {
                type: "string",
                description: "Versión A del mensaje (más directa, con oferta si aplica)"
              },
              message_variant_b: {
                type: "string",
                description: "Versión B del mensaje (más emocional, recordatorio de experiencia)"
              },
              suggested_offer: {
                type: "string",
                description: "Oferta personalizada basada en sus productos favoritos (opcional)"
              },
              personalization_basis: {
                type: "string",
                description: "Por qué se personalizó así (ej: 'Cliente de café frecuente, 35 días sin visita')"
              }
            },
            required: ["customer_id", "customer_label", "message_variant_a", "message_variant_b"]
          }
        },
        segment_name: {
          type: "string",
          description: "Nombre del segmento analizado"
        },
        total_customers_analyzed: { type: "number" }
      },
      required: ["messages", "total_customers_analyzed"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 5: CREAR PROPUESTA PARA APROBACIÓN HUMANA (HUMAN-IN-THE-LOOP)
  // Esta tool es el PUENTE entre la IA y la base de datos.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "create_ai_proposal",
    description: `Crea una propuesta de acción que será revisada y aprobada por el usuario
    antes de ejecutarse. SIEMPRE usa esta tool cuando quieras modificar datos críticos:
    inventario, pedidos, precios, descuentos, stock. NUNCA modifiques datos directamente.
    El backend registrará la propuesta en la tabla ai_proposals con status='pending'.`,
    input_schema: {
      type: "object",
      properties: {
        proposal_type: {
          type: "string",
          enum: ["inventory_entry", "purchase_order", "discount", "stock_adjustment", "marketing_message", "price_update"],
          description: "Tipo de acción que se propone"
        },
        title: {
          type: "string",
          description: "Título corto y claro para el usuario (ej: 'Registrar 23 productos de factura Colanta #4521')"
        },
        description: {
          type: "string",
          description: "Explicación completa: qué detecté, por qué lo propongo, qué pasará si apruebas"
        },
        payload: {
          type: "object",
          description: `Datos estructurados exactos que el backend usará para ejecutar la acción.
          El formato varía según proposal_type:

          inventory_entry: { supplier_invoice_id, items: [{product_id, quantity, unit_cost, vat_rate}] }
          purchase_order: { supplier_id, items: [{product_id, quantity, unit_cost}], expected_at }
          stock_adjustment: { branch_id, items: [{product_id, quantity_delta, reason}] }
          marketing_message: { segment_id, messages: [{customer_id, message_text, channel: 'whatsapp'}] }
          discount: { order_id, discount_type, discount_value, reason }
          price_update: { product_id, new_price, reason }
          `
        },
        confidence_score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Qué tan segura está la IA de esta propuesta (0-100)"
        },
        source_type: {
          type: "string",
          enum: ["supplier_invoice", "sales_analysis", "manual_request", "scheduled_analysis"]
        },
        source_id: {
          type: "string",
          description: "UUID del recurso que originó la propuesta (factura, análisis, etc.)"
        },
        items_count: {
          type: "integer",
          description: "Número de ítems involucrados en la propuesta"
        }
      },
      required: ["proposal_type", "title", "description", "payload", "confidence_score"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 6: CONSULTAR DATOS DEL NEGOCIO (READ-ONLY)
  // Modelo recomendado: claude-haiku-4-5 (rápido para consultas simples)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "query_business_data",
    description: `Consulta datos del negocio para responder preguntas del dueño.
    Esta tool es SOLO LECTURA. Devuelve el nombre de la vista o tabla a consultar
    y los filtros a aplicar. El backend ejecuta la consulta y retorna los datos.`,
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: [
            "daily_sales",          // Ventas del día/período
            "product_profitability", // Rentabilidad por producto
            "inventory_status",      // Estado actual del inventario
            "customer_ranking",      // Clientes por valor
            "payment_methods",       // Mix de métodos de pago
            "top_products",          // Productos más vendidos
            "cash_session_summary",  // Resumen de sesión de caja
            "pending_ai_proposals"   // Propuestas pendientes de aprobación
          ]
        },
        filters: {
          type: "object",
          properties: {
            branch_id: { type: "string" },
            date_from: { type: "string", description: "YYYY-MM-DD" },
            date_to: { type: "string", description: "YYYY-MM-DD" },
            category_id: { type: "string" },
            limit: { type: "integer", default: 20 }
          }
        },
        natural_language_question: {
          type: "string",
          description: "La pregunta original del usuario, para que el backend genere la respuesta correctamente"
        }
      },
      required: ["query_type", "natural_language_question"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 7: ESTADO DEL SISTEMA (CO-PILOTO)
  // Verifica la salud del ecosistema FERZU en tiempo real.
  // Usa cuando el usuario pregunte por problemas del sistema, lentitud,
  // errores de pago, fallos de sincronización o estado general.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "get_system_health",
    description: `Verifica el estado de salud del sistema FERZU POS en tiempo real:
    base de datos Supabase (latencia y conexiones), backend Railway (memoria, CPU, uptime)
    y cadena de sincronización offline (órdenes pendientes, tasa de error).
    Úsalo cuando el usuario reporte lentitud, errores, problemas de pago o sincronización.
    También úsalo proactivamente al inicio de sesión para detectar problemas antes de que impacten al negocio.`,
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Por qué se está verificando el sistema (ej: 'usuario reportó lentitud', 'check proactivo al abrir')"
        }
      },
      required: ["reason"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 8: ALERTAS DE INVENTARIO CRÍTICO (CO-PILOTO)
  // Obtiene productos agotados o con stock crítico sin necesidad de
  // navegar a la pantalla de inventario. Proactivo y accionable.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "get_inventory_alerts",
    description: `Obtiene una lista priorizada de productos con stock crítico o agotado.
    Para cada producto crítico muestra: nombre, stock actual, stock mínimo y días estimados
    antes de agotamiento basado en ventas recientes.
    Úsalo cuando el usuario pregunte por el inventario, o proactivamente para alertar
    al dueño sobre productos que se van a agotar antes del próximo pedido.`,
    input_schema: {
      type: "object",
      properties: {
        branch_id: {
          type: "string",
          description: "UUID de la sucursal a revisar. Opcional — si no se especifica revisa todas."
        },
        severity_filter: {
          type: "string",
          enum: ["all", "critical_only", "out_of_stock_only"],
          description: "Qué tan urgente debe ser el alert. 'critical_only' = stock < mínimo. 'out_of_stock_only' = stock = 0."
        }
      },
      required: ["severity_filter"]
    }
  },

  // ── Tool 9: void_last_order ─────────────────────────────────────────────────
  {
    name: "void_last_order",
    description: `Anula la última orden pagada de la sucursal actual.

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar SIEMPRE con dry_run=true primero → obtiene detalles de la orden
2. Mostrar al usuario: total, productos, hace cuántos minutos
3. Esperar confirmación EXPLÍCITA del usuario ("sí", "confirmo", "anula")
4. Solo entonces llamar con dry_run=false + order_id + reason

Restricciones de seguridad:
- Solo órdenes pagadas en los últimos 30 minutos
- Requiere rol admin u owner
- Queda registrado en audit_log con motivo y usuario

Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = previsualizar sin cambios (SIEMPRE empezar aquí). false = ejecutar anulación (solo tras confirmación del usuario)."
        },
        order_id: {
          type: "string",
          description: "UUID de la orden a anular. Solo requerido cuando dry_run=false. Se obtiene del resultado previo con dry_run=true."
        },
        reason: {
          type: "string",
          description: "Motivo de la anulación. Requerido cuando dry_run=false. Ej: 'Error en el cobro', 'Pedido duplicado'."
        }
      },
      required: ["dry_run"]
    }
  },

  // ── Tool 10: generate_purchase_order ────────────────────────────────────────
  {
    name: "generate_purchase_order",
    description: `Crea una orden de compra para reabastecer inventario.

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar SIEMPRE con dry_run=true primero → obtiene preview con totales calculados
2. Mostrar al usuario: proveedor, productos, cantidades, total estimado
3. Esperar confirmación EXPLÍCITA ("sí", "confirmo", "crea la orden")
4. Solo entonces llamar con dry_run=false

Flujo recomendado:
- Si el usuario dice "genera una orden de compra" sin especificar supplier_id,
  primero llama get_inventory_alerts para ver qué hay que reabastecer, luego
  pregunta al usuario qué proveedor usar.
- Siempre obtén el supplier_id antes de llamar esta tool.

Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = previsualizar sin crear (SIEMPRE empezar aquí). false = crear la orden en BD (solo tras confirmación)."
        },
        supplier_id: {
          type: "string",
          description: "UUID del proveedor al que se le hará la orden. Requerido siempre."
        },
        items: {
          type: "array",
          description: "Productos a incluir en la orden.",
          items: {
            type: "object",
            properties: {
              product_id:       { type: "string",  description: "UUID del producto." },
              quantity_ordered: { type: "number",  description: "Cantidad a ordenar (puede ser decimal, ej: 2.5 kg)." },
              unit_cost:        { type: "number",  description: "Costo unitario en COP (pesos enteros)." }
            },
            required: ["product_id", "quantity_ordered", "unit_cost"]
          }
        },
        expected_at: {
          type: "string",
          description: "Fecha esperada de recepción en formato YYYY-MM-DD (opcional)."
        },
        notes: {
          type: "string",
          description: "Notas adicionales para la orden (opcional). Ej: 'Urgente', 'Pedir también empaques'."
        }
      },
      required: ["dry_run", "supplier_id", "items"]
    }
  },

  // ── Tool 11: open_cash_session ──────────────────────────────────────────────
  {
    name: "open_cash_session",
    description: `Abre una sesión de caja (turno de cajero).

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar con dry_run=true primero → verifica si ya hay caja abierta y muestra estado
2. Mostrar al usuario el saldo inicial que ingresó y pedir confirmación
3. Esperar confirmación EXPLÍCITA ("sí, abre la caja", "confirmo")
4. Solo entonces llamar con dry_run=false

Flujo recomendado:
- Si el usuario dice "abre la caja" o "abrir turno", primero pregunta: ¿cuánto efectivo hay en caja?
- Necesitas el monto de efectivo inicial (opening_cash) en pesos colombianos.
- Si ya hay una caja abierta, informar al usuario y NO abrir una nueva.

Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = verificar estado sin abrir (SIEMPRE empezar aquí). false = abrir la caja (solo tras confirmación)."
        },
        opening_cash: {
          type: "number",
          description: "Monto de efectivo inicial en la caja, en pesos colombianos enteros. Ej: 200000."
        },
        branch_id: {
          type: "string",
          description: "UUID de la sucursal (opcional — si no se proporciona, se usa la del contexto)."
        }
      },
      required: ["dry_run", "opening_cash"]
    }
  },

  // ── Tool 12: close_cash_session ─────────────────────────────────────────────
  {
    name: "close_cash_session",
    description: `Cierra la sesión de caja activa (turno del cajero), calculando totales de ventas.

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar con dry_run=true primero → obtiene resumen de ventas del turno (sin cerrar)
2. Mostrar al usuario: total ventas, efectivo esperado, ventas por método de pago
3. Preguntar cuánto efectivo hay físicamente en caja (closing_cash)
4. Esperar confirmación EXPLÍCITA con el monto contado
5. Solo entonces llamar con dry_run=false

Si hay descuadre de caja (diferencia entre efectivo contado y ventas en efectivo),
explicarlo claramente al usuario antes de cerrar.

Nunca ejecutar dry_run=false sin que el usuario haya confirmado el monto de cierre.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = obtener resumen sin cerrar (SIEMPRE empezar aquí). false = cerrar la caja (solo tras confirmación)."
        },
        closing_cash: {
          type: "number",
          description: "Monto de efectivo contado al cerrar la caja, en pesos colombianos enteros. Requerido para dry_run=false."
        },
        session_id: {
          type: "string",
          description: "UUID de la sesión a cerrar (opcional — si no se proporciona, busca la sesión abierta del usuario)."
        },
        notes: {
          type: "string",
          description: "Notas de cierre (opcional). Ej: 'Sin novedad', 'Faltaron $5000 por vuelto'."
        }
      },
      required: ["dry_run"]
    }
  },

  // ── Tool 13: apply_discount ─────────────────────────────────────────────────
  {
    name: "apply_discount",
    description: `Aplica un descuento a la última orden ABIERTA (no pagada aún) de la sesión de caja activa.

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar con dry_run=true → muestra la orden actual, total sin descuento y total con el descuento propuesto
2. Mostrar al usuario: total original, descuento aplicado, nuevo total
3. Esperar confirmación EXPLÍCITA ("sí", "confirmo", "aplica el descuento")
4. Solo entonces llamar con dry_run=false

Tipos de descuento soportados:
- percentage: descuento porcentual (ej: 10 = 10% de descuento). Máximo 100%.
- fixed: monto fijo en pesos COP (ej: 5000 = $5.000 de descuento).

IMPORTANTE:
- Solo funciona en órdenes con status='open' (no pagadas aún).
- Si la orden ya está pagada, NO se puede aplicar descuento (sugerir anulación).
- Si no hay orden abierta en la sesión activa, informar al usuario.
- Para retirar un descuento ya aplicado, usar discount_type='fixed' con discount_value=0.

Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = preview sin aplicar (SIEMPRE empezar aquí). false = aplicar el descuento (solo tras confirmación)."
        },
        discount_type: {
          type: "string",
          enum: ["percentage", "fixed"],
          description: "'percentage' = porcentaje del total (ej: 10 para 10%). 'fixed' = monto fijo en COP (ej: 5000 para $5.000)."
        },
        discount_value: {
          type: "number",
          description: "Valor del descuento. Si discount_type='percentage', es el porcentaje (0-100). Si es 'fixed', es el monto en pesos COP."
        },
        order_id: {
          type: "string",
          description: "UUID de la orden específica (opcional). Si no se proporciona, se usa la última orden abierta de la sesión activa."
        },
        reason: {
          type: "string",
          description: "Motivo del descuento (opcional pero recomendado). Ej: 'Cliente VIP', 'Promoción del día', 'Error en pedido'."
        }
      },
      required: ["dry_run", "discount_type", "discount_value"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 14: CREAR PRODUCTO
  // Permite al cajero/dueño agregar un producto al catálogo desde el Co-Piloto.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "create_product",
    description: `Crea un nuevo producto o servicio en el catálogo del negocio.

PROTOCOLO OBLIGATORIO DE DOS FASES:
1. Llamar con dry_run=true → muestra preview del producto que se va a crear
2. Mostrar al usuario: nombre, tipo, precio, IVA, categoría, SKU
3. Esperar confirmación EXPLÍCITA ("sí", "confirmo", "crea el producto")
4. Solo entonces llamar con dry_run=false

CUÁNDO USARLO:
- El cajero/dueño dice "agregar producto", "crear producto", "nuevo producto", "necesito vender X".
- Se detecta que un producto escaneado no existe en el catálogo.

REGLAS:
- vat_rate solo acepta: 0, 5, 8 (INC restaurantes), 19. Si el usuario no especifica, asumir 19%.
- Si el usuario dice "sin IVA" → vat_rate=0. Si dice "con IVA normal" → vat_rate=19.
- Si el usuario da nombre de categoría (ej: "bebidas"), buscamos el UUID automáticamente.
- item_type='service' para servicios (corte, lavado, consulta), 'product' para físicos.
- Nunca inventar precios — si no se proporcionan, preguntar antes de llamar la tool.

Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = preview sin crear (SIEMPRE empezar aquí). false = crear en BD (solo tras confirmación explícita)."
        },
        name: {
          type: "string",
          description: "Nombre del producto o servicio. Ej: 'Coca-Cola 350ml', 'Corte de pelo', 'Hamburguesa clásica'."
        },
        price: {
          type: "number",
          description: "Precio de venta base en pesos COP (entero, sin IVA). Ej: 3500. El sistema calculará el precio final con IVA."
        },
        vat_rate: {
          type: "number",
          enum: [0, 5, 8, 19],
          description: "Tasa de IVA. 0=sin IVA, 5=IVA reducido, 8=INC restaurantes (Ley 2010/2019), 19=IVA general. Default: 19."
        },
        cost: {
          type: "number",
          description: "Costo en COP (precio de compra al proveedor). Opcional — útil para calcular rentabilidad."
        },
        category_name: {
          type: "string",
          description: "Nombre de la categoría existente (ej: 'bebidas', 'comida', 'servicios'). Se busca el UUID automáticamente. Si no existe, se crea sin categoría."
        },
        sku: {
          type: "string",
          description: "Código interno del producto. Opcional. Ej: 'CC-350', 'CORTE-01'."
        },
        track_inventory: {
          type: "boolean",
          description: "true = llevar control de stock. false = sin control (servicios o productos ilimitados). Default: false."
        },
        unit_of_measure: {
          type: "string",
          description: "Unidad de medida. Ej: 'unidad', 'kg', 'litro', 'porción', 'hora'. Opcional."
        },
        item_type: {
          type: "string",
          enum: ["product", "service"],
          description: "'product' para físicos. 'service' para servicios (cortes, consultas, etc.). Default: 'product'."
        }
      },
      required: ["dry_run", "name", "price", "vat_rate"]
    }
  },

  // ─── Tool 15: transfer_stock ────────────────────────────────────────────────
  {
    name: "transfer_stock",
    description: `Transfiere unidades de un producto desde una sucursal origen hacia otra sucursal destino.

CUÁNDO USAR:
- El usuario pide mover stock entre tiendas/sucursales.
- Frases como: "pasa 10 unidades de Coca-Cola de la tienda norte a la sur", "traslada stock", "mueve inventario".

FLUJO OBLIGATORIO (dos fases):
1. Llama transfer_stock(dry_run=true) → muestra preview con stock actual, stock resultante y confirmación.
2. Solo tras confirmación EXPLÍCITA del usuario → llama transfer_stock(dry_run=false).

REGLAS:
- Solo funciona con productos que tengan track_inventory=true.
- La sucursal origen debe tener stock suficiente (quantity >= quantity_to_transfer).
- Los nombres de producto y sucursal se buscan por coincidencia parcial — el usuario no necesita el UUID exacto.
- Nunca ejecutar dry_run=false sin confirmación previa del usuario.`,
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "true = preview sin mover stock (SIEMPRE empezar aquí). false = ejecutar transferencia (solo tras confirmación explícita)."
        },
        product_name: {
          type: "string",
          description: "Nombre o parte del nombre del producto a transferir. Ej: 'Coca-Cola', 'Hamburguesa'. Se busca por coincidencia parcial."
        },
        from_branch_name: {
          type: "string",
          description: "Nombre o parte del nombre de la sucursal ORIGEN (de donde sale el stock). Ej: 'Norte', 'Principal', 'Bodega'."
        },
        to_branch_name: {
          type: "string",
          description: "Nombre o parte del nombre de la sucursal DESTINO (donde llega el stock). Ej: 'Sur', 'Sucursal 2', 'Tienda Centro'."
        },
        quantity: {
          type: "number",
          description: "Cantidad de unidades a transferir. Debe ser > 0. Ej: 10, 2.5 (si el producto usa decimales)."
        },
        reason: {
          type: "string",
          description: "Motivo del traslado. Opcional. Ej: 'Abastecimiento', 'Evento especial', 'Corrección de stock'."
        }
      },
      required: ["dry_run", "product_name", "from_branch_name", "to_branch_name", "quantity"]
    }
  },

  // ─── Tool 16: get_sales_summary ─────────────────────────────────────────────
  {
    name: "get_sales_summary",
    description: `Consulta el resumen de ventas del negocio para un período específico.
Úsala cuando el usuario pregunte: "¿cuánto vendí hoy?", "¿cómo van las ventas esta semana/mes?",
"¿cuánto llevamos?", "¿cómo estuvo el día?", "¿cómo vamos?", "dame el resumen de ventas".
Devuelve: total en pesos, número de órdenes, ticket promedio, hora pico y comparativa vs período anterior.`,
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month", "yesterday"],
          description: "Período a consultar. 'today'=hoy, 'yesterday'=ayer, 'week'=esta semana, 'month'=este mes."
        }
      },
      required: ["period"]
    }
  },

  // ─── Tool 17: get_retention_summary ─────────────────────────────────────────
  {
    name: "get_retention_summary",
    description: `Consulta el estado de retención de clientes del negocio.
Úsala cuando el usuario pregunte: "¿cuántos clientes tengo dormidos?", "¿cómo está la retención?",
"¿quiénes no han vuelto?", "¿cuántos clientes en riesgo?", "¿hay cumpleaños hoy?",
"¿cuántos clientes VIP tengo?", "dame el resumen de clientes".
Devuelve: conteos por segmento (activos, en riesgo, dormidos, VIP), tasa de retención y cumpleaños del día.`,
    input_schema: {
      type: "object",
      properties: {
        include_birthdays: {
          type: "boolean",
          description: "Si true, incluye clientes con cumpleaños hoy y esta semana. Default: true."
        },
        top_dormant: {
          type: "integer",
          description: "Número de clientes dormidos a mostrar por nombre (para acción inmediata). Default: 3."
        }
      },
      required: []
    }
  },

  // ─── Tool 18: close_day ─────────────────────────────────────────────────────
  {
    name: "close_day",
    description: `Genera el resumen de cierre del día y opcionalmente envía el reporte por email.
Úsala cuando el usuario diga: "cierra el día", "genera el reporte del día", "envía el resumen",
"¿cómo terminamos hoy?", "mándame el reporte", "cierre de día".
Obtiene ventas del día, genera el resumen ejecutivo y puede enviarlo por email al dueño.
IMPORTANTE: Esta tool NO cierra la sesión de caja — eso lo hace close_cash_session.
Esta tool solo genera el reporte de ventas del día.`,
    input_schema: {
      type: "object",
      properties: {
        send_email: {
          type: "boolean",
          description: "Si true, envía el reporte al email del dueño registrado en la organización."
        },
        date: {
          type: "string",
          description: "Fecha del reporte en formato YYYY-MM-DD. Si no se especifica, usa hoy."
        }
      },
      required: []
    }
  },

  // ─── Tool 19: get_top_products ──────────────────────────────────────────────
  {
    name: "get_top_products",
    description: `Consulta los productos más vendidos del negocio en un período.
Úsala cuando el usuario pregunte: "¿qué producto se está vendiendo más?", "¿cuál es el más popular?",
"top productos", "¿qué está saliendo bien?", "¿qué vendo más?", "dame el ranking de productos".
Devuelve: top 10 productos con unidades vendidas, ingresos generados y % del total.`,
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month"],
          description: "Período a analizar. Default: 'week'."
        },
        limit: {
          type: "integer",
          description: "Número de productos a retornar (máx 10). Default: 5."
        }
      },
      required: []
    }
  },

  // ─── Tool 20: get_birthday_alert ────────────────────────────────────────────
  {
    name: "get_birthday_alert",
    description: `Consulta clientes con cumpleaños hoy o esta semana para enviarles un mensaje especial.
Úsala cuando el usuario pregunte: "¿hay cumpleaños hoy?", "¿quién cumple años?",
"clientes con cumpleaños", "¿a quién felicitar hoy?".
Devuelve: lista de clientes con cumpleaños hoy y en los próximos 7 días, con su teléfono.`,
    input_schema: {
      type: "object",
      properties: {
        days_ahead: {
          type: "integer",
          description: "Días hacia adelante para buscar cumpleaños. Default: 7."
        }
      },
      required: []
    }
  }
];


// =============================================================================
// SECCIÓN 3: CLIENTE CLAUDE CONFIGURADO (BACKEND NODE.JS)
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Modelos disponibles
const MODELS = {
  COMPLEX:  'claude-sonnet-4-6',    // Análisis de facturas, anomalías, reportes
  FAST:     'claude-haiku-4-5-20251001',  // Generación de mensajes, consultas simples
};

/**
 * Ejecuta una llamada al agente FERZU IA con las tools disponibles.
 * @param {string} userMessage - Mensaje o solicitud del usuario
 * @param {Array} conversationHistory - Historial previo de la conversación
 * @param {Object} context - Contexto del negocio (org_id, branch_id, business_type)
 * @param {string} model - Modelo a usar (COMPLEX o FAST)
 * @returns {Object} Respuesta del agente con texto y/o propuestas
 */
export async function runFerzuAgent(userMessage, conversationHistory = [], context, model = MODELS.COMPLEX) {

  // Inyectar contexto del negocio en el system prompt
  const systemWithContext = `${FERZU_SYSTEM_PROMPT}${context._system_suffix || ''}

## CONTEXTO ACTUAL DEL NEGOCIO
- Organización ID: ${context.organization_id}
- Sucursal ID: ${context.branch_id}
- Tipo de negocio: ${context.business_type}
- Nombre del negocio: ${context.business_name}
- Fecha actual: ${new Date().toLocaleDateString('es-CO')}
- Usuario activo: ${context.user_name} (rol: ${context.user_role})
- Página actual: ${context.page_context || 'general'}
`;

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  // Agentic loop: la IA puede llamar múltiples tools en una sola solicitud
  let response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemWithContext,
    tools: FERZU_TOOLS,
    messages,
  });

  const results = [];

  // Procesar tool calls en loop hasta que la IA termine
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const toolResult = await executeTool(toolUse.name, toolUse.input, context);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      });
      results.push({ tool: toolUse.name, input: toolUse.input, result: toolResult });
    }

    // Continuar el loop con los resultados de las tools
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemWithContext,
      tools: FERZU_TOOLS,
      messages,
    });
  }

  // Extraer texto final
  const finalText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return {
    text: finalText,
    tool_results: results,
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    model_used: model,
  };
}


// =============================================================================
// SECCIÓN 4: EJECUTOR DE TOOLS (BACKEND)
// Aquí el BACKEND hace los cálculos matemáticos, NO la IA.
// =============================================================================

async function executeTool(toolName, toolInput, context) {
  switch (toolName) {

    case 'analyze_supplier_invoice':
      // La IA ya extrajo los datos. El backend ahora:
      // 1. Busca los productos extraídos en la BD por nombre/SKU
      // 2. Calcula los totales matemáticamente
      // 3. Crea la propuesta en ai_proposals
      return await handleInvoiceAnalysis(toolInput, context);

    case 'detect_inventory_anomalies':
      // La IA detectó anomalías. El backend:
      // 1. Crea alertas en system_alerts
      // 2. Asocia las anomalías a los productos correctos
      return await handleAnomalyDetection(toolInput, context);

    case 'suggest_reorder':
      // La IA sugirió cantidades. El backend:
      // 1. Valida que los productos existan
      // 2. Formatea como borrador de purchase_order
      return await handleReorderSuggestion(toolInput, context);

    case 'generate_marketing_messages':
      // La IA generó mensajes. El backend:
      // 1. Valida que los clientes existan
      // 2. Crea la propuesta para aprobación
      return await handleMarketingMessages(toolInput, context);

    case 'create_ai_proposal':
      // ACCIÓN CENTRAL: Guarda la propuesta en la BD
      return await saveAiProposal(toolInput, context);

    case 'query_business_data':
      // SOLO LECTURA: Ejecuta la consulta y devuelve datos
      return await queryBusinessData(toolInput, context);

    case 'get_system_health':
      return await checkSystemHealth(toolInput, context);

    case 'get_inventory_alerts':
      return await getInventoryAlerts(toolInput, context);

    case 'void_last_order':
      return await voidLastOrder(toolInput, context);

    case 'generate_purchase_order':
      return await generatePurchaseOrder(toolInput, context);

    case 'open_cash_session':
      return await openCashSession(toolInput, context);

    case 'close_cash_session':
      return await closeCashSession(toolInput, context);

    case 'apply_discount':
      return await applyDiscount(toolInput, context);

    case 'create_product':
      return await createProduct(toolInput, context);

    case 'transfer_stock':
      return await transferStock(toolInput, context);

    case 'get_sales_summary':
      return await getSalesSummary(toolInput, context);

    case 'get_retention_summary':
      return await getRetentionSummary(toolInput, context);

    case 'close_day':
      return await closeDayReport(toolInput, context);

    case 'get_top_products':
      return await getTopProducts(toolInput, context);

    case 'get_birthday_alert':
      return await getBirthdayAlert(toolInput, context);

    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}


// =============================================================================
// SECCIÓN 5: HANDLERS DE CADA TOOL (LÓGICA DE NEGOCIO EN BACKEND)
// =============================================================================

async function handleInvoiceAnalysis(aiOutput, context) {
  const { supabase } = context;

  // El backend matchea productos por nombre usando búsqueda fuzzy
  const matchedItems = [];
  for (const item of aiOutput.invoice_items) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, cost')
      .eq('organization_id', context.organization_id)
      .ilike('name', `%${item.matched_product_name}%`)
      .limit(3);

    matchedItems.push({
      ...item,
      matched_products: products || [],
      // ⚠️ El backend convierte el string de precio a número (NO la IA)
      unit_cost_numeric: parseFloat(item.unit_cost_raw.replace(/[^0-9.]/g, '')) || null,
    });
  }

  return {
    success: true,
    matched_items: matchedItems,
    needs_review_count: matchedItems.filter(i => i.confidence < 80 || i.matched_products.length === 0).length,
    message: `Se extrajeron ${matchedItems.length} ítems. ${matchedItems.filter(i => i.confidence < 80).length} requieren revisión manual.`
  };
}

async function saveAiProposal(proposalData, context) {
  const { supabase } = context;

  const { data, error } = await supabase
    .from('ai_proposals')
    .insert({
      organization_id: context.organization_id,
      branch_id: context.branch_id,
      proposal_type: proposalData.proposal_type,
      title: proposalData.title,
      description: proposalData.description,
      payload: proposalData.payload,
      confidence_score: proposalData.confidence_score,
      source_type: proposalData.source_type,
      source_id: proposalData.source_id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Notificar al usuario en tiempo real via Supabase Realtime
  // (El frontend escucha el canal 'ai_proposals' y muestra el toast de aprobación)

  return {
    success: true,
    proposal_id: data.id,
    message: `Propuesta creada. El usuario debe aprobarla en el panel de IA.`,
    expires_at: data.expires_at,
  };
}

async function executeApprovedProposal(proposalId, userId, context) {
  // Esta función se llama SOLO cuando el usuario hace clic en "Aprobar"
  const { supabase } = context;

  const { data: proposal } = await supabase
    .from('ai_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (!proposal || proposal.status !== 'pending') {
    throw new Error('Propuesta no encontrada o ya procesada');
  }

  let affectedRecords = [];
  let success = false;

  try {
    switch (proposal.proposal_type) {

      case 'inventory_entry':
        // Insertar movimientos de inventario (el BACKEND calcula los totales)
        for (const item of proposal.payload.items) {
          await supabase.from('inventory_movements').insert({
            branch_id: context.branch_id,
            product_id: item.product_id,
            movement_type: 'purchase',
            quantity: item.quantity,                    // Cantidad real
            unit_cost: Math.round(item.unit_cost),      // ⚠️ Redondeado en backend
            reference_type: 'ai_proposal',
            reference_id: proposalId,
          });

          // Actualizar inventario actual con UPSERT
          const { data: inv } = await supabase
            .from('inventory')
            .select('quantity, average_cost')
            .eq('branch_id', context.branch_id)
            .eq('product_id', item.product_id)
            .single();

          const newQty = (inv?.quantity || 0) + item.quantity;
          const newAvgCost = inv
            ? Math.round((inv.average_cost * inv.quantity + item.unit_cost * item.quantity) / newQty)
            : Math.round(item.unit_cost);

          await supabase.from('inventory').upsert({
            branch_id: context.branch_id,
            product_id: item.product_id,
            quantity: newQty,
            last_cost: Math.round(item.unit_cost),
            average_cost: newAvgCost,
            updated_at: new Date().toISOString(),
          });

          affectedRecords.push({ table: 'inventory', action: 'upsert', product_id: item.product_id });
        }
        success = true;
        break;

      case 'purchase_order':
        const { data: po } = await supabase.from('purchase_orders').insert({
          branch_id: context.branch_id,
          supplier_id: proposal.payload.supplier_id,
          order_number: `PO-${Date.now()}`,
          status: 'draft',
          source: 'ai_suggested',
          ai_proposal_id: proposalId,
          expected_at: proposal.payload.expected_at,
          created_by: userId,
        }).select().single();

        // Insertar ítems (el BACKEND calcula subtotales e IVA)
        for (const item of proposal.payload.items) {
          const subtotal = item.quantity * item.unit_cost;      // BACKEND calcula
          const vatAmount = Math.round(subtotal * (item.vat_rate || 0) / 100);
          const total = subtotal + vatAmount;

          await supabase.from('purchase_order_items').insert({
            purchase_order_id: po.id,
            product_id: item.product_id,
            quantity_ordered: item.quantity,
            unit_cost: Math.round(item.unit_cost),
            vat_rate: item.vat_rate || 0,
            subtotal: Math.round(subtotal),
            tax_amount: vatAmount,
            total: Math.round(total),
          });
        }
        affectedRecords.push({ table: 'purchase_orders', action: 'insert', id: po.id });
        success = true;
        break;

      // ... otros casos según proposal_type
    }

    // Marcar propuesta como ejecutada
    await supabase.from('ai_proposals').update({
      status: 'executed',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', proposalId);

    // Registrar ejecución en log
    await supabase.from('ai_proposal_executions').insert({
      proposal_id: proposalId,
      executed_at: new Date().toISOString(),
      success: true,
      affected_records: affectedRecords,
      executed_by: userId,
    });

    // Registrar en auditoría
    await supabase.from('audit_log').insert({
      organization_id: context.organization_id,
      user_id: userId,
      action: 'approve',
      table_name: 'ai_proposals',
      record_id: proposalId,
      new_values: { proposal_type: proposal.proposal_type, status: 'executed' },
    });

  } catch (err) {
    // Registrar fallo
    await supabase.from('ai_proposal_executions').insert({
      proposal_id: proposalId,
      success: false,
      error_message: err.message,
      executed_by: userId,
    });
    throw err;
  }

  return { success, affected_records: affectedRecords };
}

export async function queryBusinessData(queryInput, context) {
  const { supabase } = context;
  const { query_type, filters = {} } = queryInput;
  const orgId    = context.organization_id;
  const branchId = filters.branch_id || context.branch_id;
  const lim      = filters.limit || 30;

  // Fechas por defecto: últimos 7 días
  const today    = new Date().toISOString().split('T')[0];
  const week_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateFrom = filters.date_from || week_ago;
  const dateTo   = filters.date_to   || today;

  switch (query_type) {

    // ── Ventas diarias (vista v_daily_sales) ─────────────────────────────
    case 'daily_sales': {
      let q = supabase.from('v_daily_sales').select('*');
      if (orgId)    q = q.eq('organization_id', orgId);
      if (branchId) q = q.eq('branch_id', branchId);
      q = q.gte('sale_date', dateFrom).lte('sale_date', dateTo)
           .order('sale_date', { ascending: false }).limit(lim);
      const { data, error } = await q;
      if (error) {
        // Fallback: consultar orders directamente si la vista no existe
        let q2 = supabase
          .from('orders')
          .select('id, total, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', `${dateFrom}T00:00:00-05:00`)
          .lte('created_at', `${dateTo}T23:59:59-05:00`);
        if (branchId) q2 = q2.eq('branch_id', branchId);
        const { data: orders, error: e2 } = await q2.order('created_at', { ascending: false }).limit(200);
        if (e2) return { error: e2.message };
        // Agrupar por día
        const byDay = {};
        for (const o of orders || []) {
          const day = o.created_at.split('T')[0];
          if (!byDay[day]) byDay[day] = { sale_date: day, total_sales: 0, order_count: 0, avg_ticket: 0 };
          byDay[day].total_sales += o.total;
          byDay[day].order_count++;
        }
        for (const d of Object.values(byDay)) d.avg_ticket = Math.round(d.total_sales / d.order_count);
        const rows = Object.values(byDay).sort((a, b) => b.sale_date.localeCompare(a.sale_date));
        return { data: rows, count: rows.length, query_type, source: 'orders_fallback' };
      }
      return { data, count: data?.length, query_type };
    }

    // ── Productos más vendidos ────────────────────────────────────────────
    case 'top_products': {
      let q = supabase
        .from('order_items')
        .select('product_id, quantity, subtotal, products(name), orders!inner(created_at, status, branch_id)')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', `${dateFrom}T00:00:00-05:00`)
        .lte('orders.created_at', `${dateTo}T23:59:59-05:00`);
      if (branchId) q = q.eq('orders.branch_id', branchId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const map = {};
      for (const item of data || []) {
        const pid = item.product_id;
        if (!map[pid]) map[pid] = { product_id: pid, name: item.products?.name, units_sold: 0, revenue: 0 };
        map[pid].units_sold += item.quantity;
        map[pid].revenue    += item.subtotal;
      }
      const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, lim);
      return { data: rows, count: rows.length, query_type };
    }

    // ── Rentabilidad por producto ─────────────────────────────────────────
    case 'product_profitability': {
      let q = supabase.from('v_product_profitability').select('*').eq('organization_id', orgId);
      if (filters.category_id) q = q.eq('category_id', filters.category_id);
      q = q.order('profit_margin', { ascending: false }).limit(lim);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Estado del inventario ─────────────────────────────────────────────
    // QA-8 FIX: v_inventory_status NO tiene columna organization_id (el view no la expone).
    // Filtrar por branch_id (sí existe en el view) + RLS de Supabase filtra por org.
    // Si no hay branchId, hacemos fallback a products+inventory directamente.
    case 'inventory_status': {
      if (branchId) {
        let q = supabase.from('v_inventory_status').select('*').eq('branch_id', branchId).limit(lim);
        const { data, error } = await q;
        if (error) {
          // Fallback: consultar inventory + products directamente
          const { data: inv, error: e2 } = await supabase
            .from('inventory')
            .select('quantity, average_cost, branch_id, products(id, name, sku, price, min_stock, track_inventory)')
            .eq('branch_id', branchId)
            .eq('products.is_active', true)
            .limit(lim);
          if (e2) return { error: e2.message };
          return { data: inv, count: inv?.length, query_type, source: 'inventory_fallback' };
        }
        return { data, count: data?.length, query_type };
      } else {
        // Sin branch_id: consultar inventory filtrando por organización via productos
        const { data: inv, error } = await supabase
          .from('inventory')
          .select('quantity, average_cost, branch_id, products!inner(id, name, sku, price, min_stock, organization_id, track_inventory)')
          .eq('products.organization_id', orgId)
          .eq('products.is_active', true)
          .eq('products.track_inventory', true)
          .limit(lim);
        if (error) return { error: error.message };
        return { data: inv, count: inv?.length, query_type };
      }
    }

    // ── Mix de métodos de pago ────────────────────────────────────────────
    case 'payment_methods': {
      // Intentar con order_payments primero, fallback a orders con metadata
      let q = supabase.from('order_payments')
        .select('payment_method, amount, orders!inner(created_at, status, branch_id)')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', `${dateFrom}T00:00:00-05:00`)
        .lte('orders.created_at', `${dateTo}T23:59:59-05:00`);
      if (branchId) q = q.eq('orders.branch_id', branchId);
      const { data, error } = await q;
      if (error) {
        // Fallback: contar órdenes sin desglose de método
        let q2 = supabase.from('orders').select('id, total').eq('status', 'completed')
          .gte('created_at', `${dateFrom}T00:00:00-05:00`)
          .lte('created_at', `${dateTo}T23:59:59-05:00`);
        if (branchId) q2 = q2.eq('branch_id', branchId);
        const { data: orders2 } = await q2;
        const total = (orders2 || []).reduce((s, o) => s + o.total, 0);
        return { data: [{ method: 'varios', count: (orders2 || []).length, total }], query_type, note: 'Sin desglose por método disponible' };
      }
      const map = {};
      for (const o of data || []) {
        const m = o.payment_method || 'efectivo';
        if (!map[m]) map[m] = { method: m, count: 0, total: 0 };
        map[m].count++;
        map[m].total += o.amount;
      }
      return { data: Object.values(map), count: Object.keys(map).length, query_type };
    }

    // ── Ranking de clientes ───────────────────────────────────────────────
    // PRIVACIDAD: Se anonimiza nombre completo antes de enviar al modelo de IA.
    // Solo se expone el segmento de gasto y comportamiento, nunca datos identificables.
    case 'customer_ranking': {
      let q = supabase.from('customers')
        .select('id, first_name, total_spent, visit_count, last_visit_at, loyalty_points')
        .eq('organization_id', orgId)
        .order('total_spent', { ascending: false })
        .limit(lim);
      const { data, error } = await q;
      if (error) return { error: error.message };
      // Anonimizar: solo inicial del nombre + ID truncado
      const anonymized = (data || []).map((c, i) => ({
        rank:          i + 1,
        customer_ref:  `CLIENTE-${c.id.slice(0, 8).toUpperCase()}`,
        initial:       c.first_name ? c.first_name[0].toUpperCase() + '.' : 'N/A',
        total_spent:   c.total_spent,
        visit_count:   c.visit_count,
        days_since_visit: c.last_visit_at
          ? Math.floor((Date.now() - new Date(c.last_visit_at)) / 86400000)
          : null,
        loyalty_points: c.loyalty_points,
        // ID real guardado para uso interno, no expuesto al prompt
        _customer_id:  c.id,
      }));
      return { data: anonymized, count: anonymized.length, query_type };
    }

    // ── Resumen sesión de caja ────────────────────────────────────────────
    case 'cash_session_summary': {
      let q = supabase.from('cash_sessions').select('*')
        .order('opened_at', { ascending: false }).limit(5);
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Propuestas IA pendientes ──────────────────────────────────────────
    case 'pending_ai_proposals': {
      let q = supabase.from('ai_proposals').select('*')
        .eq('status', 'pending')
        .eq('organization_id', orgId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(10);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    default:
      return { error: `Tipo de consulta no soportado: ${query_type}` };
  }
}

async function handleAnomalyDetection(aiOutput, context) {
  const { supabase } = context;

  for (const anomaly of aiOutput.anomalies) {
    const { data: insertedAlert } = await supabase.from('system_alerts').insert({
      organization_id: context.organization_id,
      branch_id: context.branch_id,
      alert_type: anomaly.anomaly_type,
      severity: anomaly.severity,
      title: `${anomaly.product_name}: ${anomaly.anomaly_type.replace(/_/g, ' ')}`,
      description: anomaly.description,
      data: anomaly.data_evidence,
    }).select().single();

    // Despachar alerta Level 2 (fire-and-forget)
    Promise.resolve(dispatchAlert(
      { ...insertedAlert, metadata: { producto: anomaly.product_name, ...anomaly.data_evidence } },
      context.organization_id,
      supabase
    )).catch(() => {});
  }

  return {
    success: true,
    alerts_created: aiOutput.anomalies.length,
    summary: aiOutput.analysis_summary,
  };
}

async function handleReorderSuggestion(aiOutput, context) {
  // Simplemente devuelve los datos al frontend para mostrárselos al usuario.
  // Si el usuario aprueba, se llamará a create_ai_proposal con proposal_type='purchase_order'
  return {
    success: true,
    suggestions: aiOutput.reorder_suggestions,
    message: 'Sugerencias de reabastecimiento listas para revisión.',
  };
}

async function handleMarketingMessages(aiOutput, context) {
  return {
    success: true,
    messages: aiOutput.messages,
    message: `${aiOutput.total_customers_analyzed} mensajes generados. Revísalos y aprueba los que desees enviar.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 7: checkSystemHealth
// Replica los checks del endpoint /api/health/full directamente en proceso.
// Sin HTTP round-trip — más rápido y no consume cuota de request del health check.
// ─────────────────────────────────────────────────────────────────────────────
import os from 'os';
import { supabaseAdmin }   from '../config/supabase.js';
import { dispatchAlert }   from '../services/alertDispatcher.service.js';

async function checkSystemHealth(input, context) {
  const t0 = Date.now();
  const results = {};

  // ── 1. Supabase Auth ──────────────────────────────────────────────────────
  try {
    const ta = Date.now();
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency = Date.now() - ta;
    results.supabase_auth = error
      ? { status: 'error', latency_ms: latency, detail: error.message }
      : { status: latency > 800 ? 'slow' : 'ok', latency_ms: latency };
  } catch (e) {
    results.supabase_auth = { status: 'error', detail: e.message };
  }

  // ── 2. Supabase DB ────────────────────────────────────────────────────────
  try {
    const td = Date.now();
    const { error } = await supabaseAdmin
      .from('organizations').select('id', { count: 'exact', head: true });
    const latency = Date.now() - td;
    results.supabase_db = error
      ? { status: 'error', latency_ms: latency, detail: error.message }
      : { status: latency > 600 ? 'slow' : 'ok', latency_ms: latency };
  } catch (e) {
    results.supabase_db = { status: 'error', detail: e.message };
  }

  // ── 3. Backend process ───────────────────────────────────────────────────
  const mem    = process.memoryUsage();
  const memMb  = Math.round(mem.rss / 1024 / 1024);
  const load   = os.loadavg()[0];
  const cpuPct = Math.min(Math.round((load / Math.max(os.cpus().length, 1)) * 100), 100);
  results.backend = {
    status:           memMb > 600 ? 'critical' : memMb > 350 ? 'slow' : 'ok',
    uptime_seconds:   Math.round(process.uptime()),
    memory_mb:        memMb,
    cpu_pct:          cpuPct,
  };

  // ── 4. Órdenes abiertas atascadas (proxy sync chain) ────────────────────
  try {
    const stuckSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('orders').select('id', { count: 'exact', head: true })
      .eq('status', 'open').lt('created_at', stuckSince);
    results.sync_chain = {
      status:          (count || 0) > 100 ? 'critical' : (count || 0) > 20 ? 'slow' : 'ok',
      stuck_orders:    count || 0,
    };
  } catch {
    results.sync_chain = { status: 'unknown' };
  }

  // ── Status global ────────────────────────────────────────────────────────
  const statuses = Object.values(results).map(r => r.status);
  const overall  = statuses.includes('error') || statuses.includes('critical') ? 'critical'
                 : statuses.includes('slow')                                    ? 'degraded'
                 : 'ok';

  return {
    overall,
    check_ms:    Date.now() - t0,
    components:  results,
    checked_at:  new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 8: getInventoryAlerts
// Consulta stock crítico sin pasar por /inventory/insights (evita llamada IA anidada).
// Devuelve lista priorizada: agotados primero, luego por urgencia.
// ─────────────────────────────────────────────────────────────────────────────
async function getInventoryAlerts(input, context) {
  const { supabase } = context;
  const { branch_id, severity_filter = 'all' } = input;

  try {
    // Usar la vista v_inventory_status si existe, fallback a join manual
    let query = supabase
      .from('v_inventory_status')
      .select('*')
      .in('stock_status', severity_filter === 'out_of_stock_only'
        ? ['out_of_stock']
        : severity_filter === 'critical_only'
          ? ['out_of_stock', 'low_stock']
          : ['out_of_stock', 'low_stock', 'normal'])
      .order('stock_status', { ascending: true })
      .limit(20);

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data, error } = await query;

    if (error) {
      // Fallback: query directa si la vista no existe
      let q2 = supabase
        .from('inventory')
        .select('quantity, branch_id, products!inner(id, name, sku, min_stock, is_active)')
        .eq('products.is_active', true);
      if (branch_id) q2 = q2.eq('branch_id', branch_id);
      const { data: inv } = await q2;

      const alerts = (inv || [])
        .map(i => ({
          product_name:  i.products?.name,
          sku:           i.products?.sku,
          current_stock: i.quantity,
          min_stock:     i.products?.min_stock || 0,
          stock_status:  i.quantity === 0 ? 'out_of_stock'
                       : i.quantity <= (i.products?.min_stock || 0) ? 'low_stock'
                       : 'normal',
        }))
        .filter(i => i.stock_status !== 'normal')
        .sort((a, b) => a.current_stock - b.current_stock);

      return {
        alerts,
        critical_count:  alerts.filter(a => a.stock_status === 'out_of_stock').length,
        warning_count:   alerts.filter(a => a.stock_status === 'low_stock').length,
        total_alerts:    alerts.length,
      };
    }

    const critical = (data || []).filter(i => i.stock_status === 'out_of_stock');
    const warning  = (data || []).filter(i => i.stock_status === 'low_stock');

    return {
      alerts:         data || [],
      critical_count: critical.length,
      warning_count:  warning.length,
      total_alerts:   (data || []).length,
    };
  } catch (e) {
    return { error: e.message, alerts: [], critical_count: 0, warning_count: 0, total_alerts: 0 };
  }
}


// =============================================================================
// SECCIÓN 5b: TOOL 9 — void_last_order
// =============================================================================

async function voidLastOrder({ dry_run = true, order_id, reason }, context) {
  const orgId    = context.organization_id;
  const branchId = context.branch_id;
  const userId   = context.user_id;
  const userRole = context.user_role;

  // Diagnóstico: exponer contexto si faltan valores críticos
  if (!orgId) {
    return { error: `DIAGNÓSTICO: organization_id es undefined. Contexto recibido: org=${orgId}, branch=${branchId}, role=${userRole}, user=${userId}`, can_void: false };
  }

  // Solo admin/owner pueden anular
  if (!['owner', 'admin'].includes(userRole)) {
    return { error: `Permiso insuficiente. Tu rol actual es "${userRole}". Solo el dueño (owner) o administrador (admin) puede anular órdenes desde el Co-Piloto.` };
  }

  const since30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // ── FASE 1: previsualizar (dry_run=true) ──────────────────────────────────
  if (dry_run) {
    // NOTA: la tabla 'orders' NO tiene columna organization_id directa.
    // La org se filtra via branch_id (branches sí tienen organization_id).
    let orderQuery = supabaseAdmin
      .from('orders')
      .select('id, total, status, created_at, branch_id')
      .eq('status', 'paid')
      .gte('created_at', since30min)
      .order('created_at', { ascending: false })
      .limit(1);

    if (branchId) {
      // Caso normal: filtrar por sucursal específica (ya es org-scoped)
      orderQuery = orderQuery.eq('branch_id', branchId);
    } else {
      // Fallback: obtener todas las sucursales de la org
      const { data: branches, error: branchErr } = await supabaseAdmin
        .from('branches')
        .select('id')
        .eq('organization_id', orgId);
      if (branchErr) return { error: `Error buscando sucursales: ${branchErr.message}`, can_void: false };
      const branchIds = (branches || []).map(b => b.id);
      if (branchIds.length === 0) return { can_void: false, message: 'No se encontraron sucursales para esta organización.' };
      orderQuery = orderQuery.in('branch_id', branchIds);
    }

    const { data: order, error } = await orderQuery.maybeSingle();

    if (error) return {
      error: `Error buscando orden: ${error.message} | code=${error.code} | hint=${error.hint || 'none'} | orgId=${orgId} | branchId=${branchId}`,
      can_void: false,
    };
    if (!order) return {
      can_void: false,
      message: 'No hay órdenes pagadas en los últimos 30 minutos. Si la orden es más antigua, usa el módulo de Cajas.',
    };

    // Query 2: obtener ítems por separado
    const { data: rawItems } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, subtotal')
      .eq('order_id', order.id);

    const minutesAgo = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000);
    const items = (rawItems || []).map(i =>
      `${i.quantity}× ${i.product_name} ($${(i.subtotal || 0).toLocaleString('es-CO')})`
    );

    return {
      can_void:    true,
      dry_run:     true,
      order_id:    order.id,
      total:       order.total,
      minutes_ago: minutesAgo,
      items,
      items_count: items.length,
      message:     `Orden encontrada:\n• Total: $${order.total.toLocaleString('es-CO')}\n• Hace: ${minutesAgo} minuto(s)\n• Productos: ${items.join(', ') || 'sin detalle'}\n\n¿Confirmas la anulación? Dime el motivo.`,
    };
  }

  // ── FASE 2: ejecutar anulación (dry_run=false) ────────────────────────────
  if (!order_id) return { error: 'Se requiere order_id para anular. Ejecuta primero con dry_run=true.' };
  if (!reason)   return { error: 'Se requiere el motivo (reason) de la anulación.' };

  // Re-verificar que sigue siendo válida (pagada, reciente, misma org)
  // orders no tiene organization_id — verificamos via branch perteneciente a la org
  const { data: order, error: fetchErr } = await supabaseAdmin
    .from('orders')
    .select('id, total, status, created_at, branch_id')
    .eq('id', order_id)
    .maybeSingle();

  if (fetchErr || !order) return { error: 'Orden no encontrada o sin acceso.' };
  if (order.status !== 'paid')             return { error: `La orden ya está en estado "${order.status}" — no se puede anular.` };
  if (new Date(order.created_at) < new Date(since30min)) {
    return { error: 'La orden tiene más de 30 minutos. Para anularla usa el módulo de Cajas.' };
  }

  // Anular la orden (sin filtro organization_id — orders no tiene esa columna)
  const { error: updateErr } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order_id);

  if (updateErr) return { error: `Error al anular la orden: ${updateErr.message}` };

  // Registrar en audit_log (fire-and-forget)
  Promise.resolve(supabaseAdmin.from('audit_log').insert({
    organization_id: orgId,
    user_id:         userId,
    action:          'void_order_via_copilot',
    resource_type:   'order',
    resource_id:     order_id,
    old_values:      { status: 'paid' },
    new_values:      { status: 'cancelled', reason, voided_via: 'copilot' },
  })).catch(() => {});

  return {
    success:         true,
    dry_run:         false,
    voided_order_id: order_id,
    total_voided:    order.total,
    message:         `✅ Orden anulada exitosamente.\n• Total: $${order.total.toLocaleString('es-CO')}\n• Motivo registrado: "${reason}"\n• Queda en el historial de auditoría.`,
  };
}


// =============================================================================
// SECCIÓN 5c: TOOL 10 — generate_purchase_order
// =============================================================================

async function generatePurchaseOrder({ dry_run = true, supplier_id, items, expected_at, notes }, context) {
  const orgId    = context.organization_id;
  const branchId = context.branch_id;
  const userId   = context.user_id;
  const userRole = context.user_role;

  if (!orgId) return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };
  if (!['owner', 'admin'].includes(userRole)) {
    return { error: `Permiso insuficiente. Tu rol actual es "${userRole}". Solo owner o admin pueden crear órdenes de compra desde el Co-Piloto.` };
  }
  if (!supplier_id) return { error: 'Se requiere supplier_id para crear la orden de compra.' };
  if (!items || items.length === 0) return { error: 'Se requiere al menos un ítem en la orden de compra.' };

  // ── Validar proveedor (pertenece a la org) ───────────────────────────────
  const { data: supplier, error: supplierErr } = await supabaseAdmin
    .from('suppliers')
    .select('id, name')
    .eq('id', supplier_id)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .maybeSingle();

  if (supplierErr) return { error: `Error validando proveedor: ${supplierErr.message}` };
  if (!supplier)   return { error: `Proveedor no encontrado o no pertenece a esta organización. supplier_id=${supplier_id}` };

  // ── Validar productos y calcular totales (BACKEND — nunca la IA) ─────────
  const productIds = items.map(i => i.product_id);
  const { data: products, error: prodErr } = await supabaseAdmin
    .from('products')
    .select('id, name, cost, vat_rate')
    .in('id', productIds)
    .eq('organization_id', orgId);

  if (prodErr) return { error: `Error validando productos: ${prodErr.message}` };

  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const missingIds = productIds.filter(id => !productMap[id]);
  if (missingIds.length > 0) {
    return { error: `Productos no encontrados o no pertenecen a esta org: ${missingIds.join(', ')}` };
  }

  // Calcular totales en backend con Math.round (sin flotantes)
  let subtotal  = 0;
  let tax_total = 0;
  const lineItems = items.map(item => {
    const prod       = productMap[item.product_id];
    const unitCost   = Math.round(Math.max(0, Number(item.unit_cost) || prod.cost || 0));
    const qty        = Number(item.quantity_ordered) || 0;
    const vatRate    = prod.vat_rate || 0;
    const lineBase   = Math.round(unitCost * qty);
    const lineTax    = Math.round(lineBase * vatRate / 100);
    const lineTotal  = lineBase + lineTax;
    subtotal  += lineBase;
    tax_total += lineTax;
    return {
      product_id:       item.product_id,
      product_name:     prod.name,
      quantity_ordered: qty,
      unit_cost:        unitCost,
      vat_rate:         vatRate,
      subtotal:         lineBase,
      tax_amount:       lineTax,
      total:            lineTotal,
    };
  });
  const total = subtotal + tax_total;

  // ── FASE 1: previsualizar (dry_run=true) ─────────────────────────────────
  if (dry_run) {
    const linesSummary = lineItems.map(l =>
      `• ${l.quantity_ordered}× ${l.product_name} @ $${l.unit_cost.toLocaleString('es-CO')} = $${l.total.toLocaleString('es-CO')}`
    ).join('\n');

    return {
      can_create: true,
      dry_run:    true,
      supplier:   { id: supplier.id, name: supplier.name },
      items:      lineItems,
      subtotal,
      tax_total,
      total,
      expected_at: expected_at || null,
      message: `📦 Vista previa — Orden de compra:\n• Proveedor: ${supplier.name}\n${linesSummary}\n• Subtotal: $${subtotal.toLocaleString('es-CO')}\n• IVA: $${tax_total.toLocaleString('es-CO')}\n• **Total: $${total.toLocaleString('es-CO')}**${expected_at ? `\n• Entrega esperada: ${expected_at}` : ''}\n\n¿Confirmas la creación de esta orden?`,
    };
  }

  // ── FASE 2: crear la orden (dry_run=false) ───────────────────────────────
  // Determinar branch_id: usar el del contexto o la primera sucursal de la org
  let targetBranchId = branchId;
  if (!targetBranchId) {
    const { data: branch } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!branch) return { error: 'No se encontró sucursal activa para esta organización.' };
    targetBranchId = branch.id;
  }

  // Generar número de orden
  const orderNumber = `PO-${Date.now()}`;

  const { data: po, error: poErr } = await supabaseAdmin
    .from('purchase_orders')
    .insert({
      branch_id:   targetBranchId,
      supplier_id,
      order_number: orderNumber,
      status:      'draft',
      subtotal,
      tax_total,
      total,
      source:      'ai_suggested',
      notes:       notes || null,
      expected_at: expected_at || null,
      created_by:  userId,
    })
    .select('id, order_number')
    .single();

  if (poErr) return { error: `Error creando la orden de compra: ${poErr.message}` };

  // Insertar ítems
  const poItems = lineItems.map(l => ({
    purchase_order_id: po.id,
    product_id:        l.product_id,
    quantity_ordered:  l.quantity_ordered,
    quantity_received: 0,
    unit_cost:         l.unit_cost,
    vat_rate:          l.vat_rate,
    subtotal:          l.subtotal,
    tax_amount:        l.tax_amount,
    total:             l.total,
  }));

  const { error: itemsErr } = await supabaseAdmin
    .from('purchase_order_items')
    .insert(poItems);

  if (itemsErr) return { error: `Orden creada (${po.order_number}) pero error en ítems: ${itemsErr.message}` };

  // Audit log (fire-and-forget)
  Promise.resolve(supabaseAdmin.from('audit_log').insert({
    organization_id: orgId,
    user_id:         userId,
    action:          'create_purchase_order_via_copilot',
    resource_type:   'purchase_order',
    resource_id:     po.id,
    old_values:      null,
    new_values:      { order_number: po.order_number, supplier_id, total, items_count: poItems.length },
  })).catch(() => {});

  return {
    success:          true,
    dry_run:          false,
    purchase_order_id: po.id,
    order_number:     po.order_number,
    total,
    items_count:      poItems.length,
    message: `✅ Orden de compra creada exitosamente.\n• Número: ${po.order_number}\n• Proveedor: ${supplier.name}\n• Total: $${total.toLocaleString('es-CO')}\n• Estado: Borrador (draft)\n• ${poItems.length} producto(s) incluidos.\n\nPuedes verla y enviarla desde el módulo de Compras.`,
  };
}


// =============================================================================
// SECCIÓN 6: EJEMPLOS DE USO / CASOS PRÁCTICOS
// =============================================================================

// =============================================================================
// SECCIÓN 5d: TOOL 11 — open_cash_session
// =============================================================================

async function openCashSession({ dry_run = true, opening_cash, branch_id }, context) {
  const orgId    = context.organization_id;
  const userId   = context.user_id;
  const ctxBranch = branch_id || context.branch_id;

  if (!orgId)    return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };
  if (!ctxBranch) return { error: 'No se pudo determinar la sucursal. Proporciona branch_id o asegúrate de estar asociado a una sucursal.' };
  if (typeof opening_cash !== 'number' || opening_cash < 0) {
    return { error: 'El monto inicial de caja (opening_cash) debe ser un número mayor o igual a 0.' };
  }

  // Validar que la sucursal pertenece a la org
  const { data: branch } = await supabaseAdmin
    .from('branches')
    .select('id, name, organization_id')
    .eq('id', ctxBranch)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!branch) return { error: 'Sucursal no encontrada o no pertenece a tu organización.' };

  // Verificar si ya hay caja abierta para este usuario en esta sucursal
  const { data: existing } = await supabaseAdmin
    .from('cash_sessions')
    .select('id, opened_at, opening_cash')
    .eq('branch_id', ctxBranch)
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();

  // ── FASE 1: dry_run — verificar estado ───────────────────────────────────
  if (dry_run) {
    if (existing) {
      const openedAt = new Date(existing.opened_at).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit' });
      return {
        dry_run: true,
        can_open: false,
        session_id: existing.id,
        message: `⚠️ Ya tienes una caja abierta en ${branch.name} desde las ${openedAt} con $${(existing.opening_cash || 0).toLocaleString('es-CO')} de saldo inicial.\n\nNo es posible abrir otra caja. Si necesitas cerrarla, di "cierra la caja".`,
      };
    }
    return {
      dry_run: true,
      can_open: true,
      branch_name: branch.name,
      opening_cash,
      message: `📋 Vista previa — Apertura de caja\n• Sucursal: ${branch.name}\n• Efectivo inicial: $${opening_cash.toLocaleString('es-CO')}\n\n¿Confirmas la apertura de caja?`,
    };
  }

  // ── FASE 2: ejecutar apertura (dry_run=false) ─────────────────────────────
  if (existing) {
    return {
      success: false,
      message: `Ya tienes una caja abierta (ID: ${existing.id}). Ciérrala antes de abrir una nueva.`,
    };
  }

  const { data: session, error: insertErr } = await supabaseAdmin
    .from('cash_sessions')
    .insert({
      branch_id:    ctxBranch,
      user_id:      userId,
      opening_cash: Math.round(opening_cash),
      status:       'open',
    })
    .select('id, opened_at')
    .single();

  if (insertErr) return { error: `Error al abrir la caja: ${insertErr.message}` };

  // Audit log (fire-and-forget)
  Promise.resolve(supabaseAdmin.from('audit_log').insert({
    organization_id: orgId,
    user_id:         userId,
    action:          'cash_open_via_copilot',
    resource_type:   'cash_sessions',
    resource_id:     session.id,
    new_values:      { opening_cash: Math.round(opening_cash), branch_id: ctxBranch },
  })).catch(() => {});

  return {
    success:      true,
    dry_run:      false,
    session_id:   session.id,
    opening_cash: Math.round(opening_cash),
    opened_at:    session.opened_at,
    message:      `✅ Caja abierta exitosamente en ${branch.name}.\n• Efectivo inicial: $${Math.round(opening_cash).toLocaleString('es-CO')}\n• Hora de apertura: ${new Date(session.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n\n¡Listo para cobrar! 💚`,
  };
}


// =============================================================================
// SECCIÓN 5e: TOOL 12 — close_cash_session
// =============================================================================

async function closeCashSession({ dry_run = true, closing_cash, session_id, notes }, context) {
  const orgId  = context.organization_id;
  const userId = context.user_id;

  if (!orgId) return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };

  // Buscar sesión activa si no se proporcionó session_id
  let sessionToClose = session_id;
  if (!sessionToClose) {
    const { data: active } = await supabaseAdmin
      .from('cash_sessions')
      .select('id, branch_id, opened_at, opening_cash, branches!inner(organization_id, name)')
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('branches.organization_id', orgId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!active) {
      return {
        dry_run,
        can_close: false,
        message: 'No tienes ninguna caja abierta en este momento. Abre una caja primero con "abre la caja".',
      };
    }
    sessionToClose = active.id;
  }

  // Calcular totales de ventas del turno
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('total, payments(payment_method, amount), discount_amount, courtesy_amount, is_courtesy')
    .eq('cash_session_id', sessionToClose)
    .eq('status', 'paid');

  const totals = {
    total_sales: 0, total_cash: 0, total_card: 0,
    total_nequi: 0, total_daviplata: 0, total_transfers: 0,
    total_discounts: 0, total_courtesy: 0, order_count: 0, courtesy_count: 0,
  };

  for (const order of orders || []) {
    totals.total_sales    += order.total;
    totals.total_discounts += order.discount_amount  || 0;
    totals.total_courtesy  += order.courtesy_amount  || 0;
    if (order.is_courtesy) totals.courtesy_count++;
    totals.order_count++;
    for (const p of order.payments || []) {
      if      (p.payment_method === 'cash')          totals.total_cash      += p.amount;
      else if (p.payment_method.startsWith('card'))  totals.total_card      += p.amount;
      else if (p.payment_method === 'nequi')         totals.total_nequi     += p.amount;
      else if (p.payment_method === 'daviplata')     totals.total_daviplata += p.amount;
      else if (p.payment_method === 'transfer')      totals.total_transfers += p.amount;
    }
  }

  // ── FASE 1: dry_run — mostrar resumen sin cerrar ──────────────────────────
  if (dry_run) {
    const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;
    const lines = [
      `📊 Resumen del turno (sesión ${sessionToClose.slice(0, 8)}…)`,
      `• Órdenes cobradas: ${totals.order_count}`,
      `• Total ventas: ${fmtCOP(totals.total_sales)}`,
      totals.total_cash      > 0 ? `  - Efectivo: ${fmtCOP(totals.total_cash)}`       : null,
      totals.total_card      > 0 ? `  - Tarjeta: ${fmtCOP(totals.total_card)}`         : null,
      totals.total_nequi     > 0 ? `  - Nequi: ${fmtCOP(totals.total_nequi)}`          : null,
      totals.total_daviplata > 0 ? `  - Daviplata: ${fmtCOP(totals.total_daviplata)}`  : null,
      totals.total_transfers > 0 ? `  - Transferencia: ${fmtCOP(totals.total_transfers)}` : null,
      totals.total_discounts > 0 ? `• Descuentos aplicados: ${fmtCOP(totals.total_discounts)}` : null,
      totals.courtesy_count  > 0 ? `• Cortesías: ${totals.courtesy_count} (${fmtCOP(totals.total_courtesy)})` : null,
      `\n¿Cuánto efectivo tienes físicamente en caja ahora? (Para calcular el descuadre)`,
    ].filter(Boolean);

    return {
      dry_run:     true,
      can_close:   true,
      session_id:  sessionToClose,
      totals,
      message:     lines.join('\n'),
    };
  }

  // ── FASE 2: ejecutar cierre (dry_run=false) ───────────────────────────────
  if (typeof closing_cash !== 'number' || closing_cash < 0) {
    return { error: 'Se requiere el monto de efectivo contado (closing_cash) para cerrar la caja.' };
  }

  const cash_difference = Math.round(closing_cash) - Math.round(totals.total_cash);
  const fmtCOP = n => `$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`;

  const { data: closed, error: closeErr } = await supabaseAdmin
    .from('cash_sessions')
    .update({
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v)])),
      closing_cash:    Math.round(closing_cash),
      cash_difference: cash_difference,
      closed_at:       new Date().toISOString(),
      status:          'closed',
      notes:           notes || null,
    })
    .eq('id', sessionToClose)
    .select('id, closed_at')
    .single();

  if (closeErr) return { error: `Error al cerrar la caja: ${closeErr.message}` };

  // Alerta de descuadre si aplica (fire-and-forget)
  if (Math.abs(cash_difference) > 5000) {
    const cashAlertSeverity = Math.abs(cash_difference) > 50000 ? 'high' : 'medium';
    Promise.resolve(
      supabaseAdmin.from('system_alerts').insert({
        organization_id: orgId,
        alert_type:      'cash_discrepancy',
        severity:        cashAlertSeverity,
        title:           `Descuadre de caja: ${cash_difference > 0 ? '+' : ''}${fmtCOP(cash_difference)} COP`,
        description:     `Sesión ${sessionToClose} cerrada vía Co-Piloto con descuadre de ${fmtCOP(Math.abs(cash_difference))} COP.`,
        data:            { session_id: sessionToClose, difference: cash_difference },
      }).select().single()
      .then(({ data: cashAlert }) => dispatchAlert(
        { ...cashAlert, metadata: { descuadre: `${fmtCOP(cash_difference)} COP`, sesión: sessionToClose } },
        orgId,
        null
      ))
    ).catch(() => {});
  }

  // Audit log (fire-and-forget)
  Promise.resolve(supabaseAdmin.from('audit_log').insert({
    organization_id: orgId,
    user_id:         userId,
    action:          'cash_close_via_copilot',
    resource_type:   'cash_sessions',
    resource_id:     sessionToClose,
    new_values:      { closing_cash: Math.round(closing_cash), cash_difference, ...totals },
  })).catch(() => {});

  const discrepancyMsg = cash_difference === 0
    ? '• Caja cuadrada ✅'
    : cash_difference > 0
      ? `• Sobrante de ${fmtCOP(cash_difference)} ⚠️`
      : `• Faltante de ${fmtCOP(cash_difference)} ⚠️`;

  return {
    success:         true,
    dry_run:         false,
    session_id:      sessionToClose,
    total_sales:     Math.round(totals.total_sales),
    closing_cash:    Math.round(closing_cash),
    cash_difference,
    closed_at:       closed.closed_at,
    message:         `✅ Caja cerrada exitosamente.\n• Total ventas del turno: $${Math.round(totals.total_sales).toLocaleString('es-CO')}\n• Efectivo contado: $${Math.round(closing_cash).toLocaleString('es-CO')}\n${discrepancyMsg}\n• Hora de cierre: ${new Date(closed.closed_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
  };
}


// =============================================================================
// SECCIÓN 5f: TOOL 13 — apply_discount
// =============================================================================

async function applyDiscount({ dry_run = true, discount_type, discount_value, order_id, reason }, context) {
  const orgId    = context.organization_id;
  const userId   = context.user_id;
  const branchId = context.branch_id;

  if (!orgId) return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };

  // Validaciones básicas
  if (!['percentage', 'fixed'].includes(discount_type)) {
    return { error: 'discount_type debe ser "percentage" o "fixed".' };
  }
  if (typeof discount_value !== 'number' || discount_value < 0) {
    return { error: 'discount_value debe ser un número mayor o igual a 0.' };
  }
  if (discount_type === 'percentage' && discount_value > 100) {
    return { error: 'El porcentaje de descuento no puede superar 100%.' };
  }

  // ── Buscar la orden objetivo ─────────────────────────────────────────────
  let order = null;

  if (order_id) {
    // Buscar orden específica — validar que pertenece a la org via branch
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, subtotal, tax_total, tip_amount, loyalty_discount, discount_amount, discount_type, discount_value, total, branch_id, created_at, order_items(product_name, quantity, subtotal)')
      .eq('id', order_id)
      .maybeSingle();

    if (error || !data) return { error: 'Orden no encontrada.' };

    // Validar ownership via branch
    const { data: branch } = await supabaseAdmin
      .from('branches')
      .select('organization_id')
      .eq('id', data.branch_id)
      .maybeSingle();

    if (!branch || branch.organization_id !== orgId) {
      return { error: 'Orden no encontrada o no pertenece a tu organización.' };
    }
    order = data;
  } else {
    // Buscar la última orden ABIERTA de la sesión activa o del cajero
    // Primero buscar sesión activa del usuario
    const { data: session } = await supabaseAdmin
      .from('cash_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let orderQuery = supabaseAdmin
      .from('orders')
      .select('id, status, subtotal, tax_total, tip_amount, loyalty_discount, discount_amount, discount_type, discount_value, total, branch_id, created_at, order_items(product_name, quantity, subtotal)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1);

    if (session) {
      orderQuery = orderQuery.eq('cash_session_id', session.id);
    } else if (branchId) {
      orderQuery = orderQuery.eq('branch_id', branchId);
    } else {
      return { error: 'No hay sesión de caja activa ni sucursal en contexto. Abre una caja primero.' };
    }

    const { data } = await orderQuery.maybeSingle();

    if (!data) {
      return {
        can_apply: false,
        message: 'No hay ninguna orden abierta (pendiente de pago) en este momento.\n\nLos descuentos solo se pueden aplicar a órdenes que aún no han sido cobradas. Si la orden ya fue pagada, usa la anulación.',
      };
    }
    order = data;
  }

  if (order.status === 'paid') {
    return {
      can_apply: false,
      message: `La orden ya fue pagada ($${order.total.toLocaleString('es-CO')}). No se puede aplicar descuento retroactivamente.\n\nSi hubo un error, puedes anularla con "anula la última venta".`,
    };
  }
  if (order.status === 'cancelled') {
    return { can_apply: false, message: 'La orden ya fue anulada. No se puede aplicar descuento.' };
  }

  // ── Calcular nuevo descuento (misma lógica que orders.routes.js) ─────────
  const base = (order.subtotal || 0) + (order.tax_total || 0);
  let new_discount_amount = 0;

  if (discount_type === 'percentage') {
    new_discount_amount = Math.round(base * discount_value / 100);
  } else {
    new_discount_amount = Math.round(Math.min(discount_value, base));
  }

  const order_subtotal     = base - new_discount_amount;
  const loyalty_discount   = order.loyalty_discount || 0;
  const tip_amount         = order.tip_amount || 0;
  const new_total          = Math.max(0, order_subtotal + tip_amount - loyalty_discount);

  const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;
  const items  = (order.order_items || []).map(i => `${i.quantity}× ${i.product_name}`).join(', ');
  const discountLabel = discount_type === 'percentage'
    ? `${discount_value}%`
    : fmtCOP(discount_value);

  // ── FASE 1: dry_run — mostrar preview ────────────────────────────────────
  if (dry_run) {
    const lines = [
      `📋 Vista previa — Descuento a aplicar`,
      `• Orden: ${order.id.slice(0, 8)}… (${items || 'sin detalle'})`,
      `• Total original: ${fmtCOP(order.total)}`,
      `• Descuento: ${discountLabel} → −${fmtCOP(new_discount_amount)}`,
      loyalty_discount > 0 ? `• Descuento fidelidad (ya aplicado): −${fmtCOP(loyalty_discount)}` : null,
      `• **Nuevo total: ${fmtCOP(new_total)}**`,
      reason ? `• Motivo: "${reason}"` : null,
      `\n¿Confirmas la aplicación del descuento?`,
    ].filter(Boolean);

    return {
      dry_run:             true,
      can_apply:           true,
      order_id:            order.id,
      original_total:      order.total,
      new_discount_amount,
      new_total,
      discount_type,
      discount_value,
      message:             lines.join('\n'),
    };
  }

  // ── FASE 2: aplicar descuento (dry_run=false) ─────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('orders')
    .update({
      discount_type,
      discount_value,
      discount_amount: new_discount_amount,
      total:           new_total,
    })
    .eq('id', order.id)
    .eq('status', 'open'); // doble seguro: no tocar órdenes pagadas

  if (updateErr) return { error: `Error al aplicar descuento: ${updateErr.message}` };

  // Audit log (fire-and-forget)
  Promise.resolve(supabaseAdmin.from('audit_log').insert({
    organization_id: orgId,
    user_id:         userId,
    action:          'apply_discount_via_copilot',
    resource_type:   'order',
    resource_id:     order.id,
    old_values:      { total: order.total, discount_amount: order.discount_amount || 0 },
    new_values:      { total: new_total, discount_amount: new_discount_amount, discount_type, discount_value, reason: reason || null },
  })).catch(() => {});

  return {
    success:         true,
    dry_run:         false,
    order_id:        order.id,
    original_total:  order.total,
    discount_applied: new_discount_amount,
    new_total,
    message:         `✅ Descuento aplicado exitosamente.\n• Descuento: ${discountLabel} → −${fmtCOP(new_discount_amount)}\n• Total anterior: ${fmtCOP(order.total)}\n• **Nuevo total: ${fmtCOP(new_total)}**${reason ? `\n• Motivo: "${reason}"` : ''}`,
  };
}


// =============================================================================
// HANDLER: createProduct
// Crea un producto/servicio en el catálogo del negocio.
// Protocolo de dos fases: dry_run=true → preview | dry_run=false → insertar en BD
// =============================================================================
async function createProduct(
  { dry_run = true, name, price, vat_rate = 19, cost, category_name, sku, track_inventory = false, unit_of_measure, item_type = 'product' },
  context
) {
  const orgId    = context.organization_id;
  const supabase = context.supabase;

  if (!orgId)   return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };
  if (!name?.trim())                             return { error: 'El nombre del producto es obligatorio.' };
  if (typeof price !== 'number' || price < 0)    return { error: 'El precio debe ser un número ≥ 0 en COP.' };
  if (![0, 5, 8, 19].includes(vat_rate))         return { error: 'vat_rate debe ser 0, 5, 8 o 19.' };

  const priceInt = Math.round(price);
  const costInt  = cost != null ? Math.round(Math.max(0, cost)) : 0;

  // ── Resolver category_id desde nombre (búsqueda fuzzy) ───────────────────
  let category_id    = null;
  let categoryLabel  = 'Sin categoría';
  if (category_name?.trim()) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', orgId)
      .ilike('name', `%${category_name.trim()}%`)
      .limit(1)
      .maybeSingle();
    if (cat) {
      category_id   = cat.id;
      categoryLabel = cat.name;
    } else {
      categoryLabel = `"${category_name}" (no encontrada — se creará sin categoría)`;
    }
  }

  const fmtCOP      = n => `$${Math.round(n).toLocaleString('es-CO')}`;
  const vatLabel    = vat_rate === 0 ? 'Sin IVA' : `IVA ${vat_rate}%`;
  // Precio al cliente = precio base + IVA (vat_included=false → IVA se suma encima)
  const priceWithVat = Math.round(priceInt * (1 + vat_rate / 100));
  const typeLabel   = item_type === 'service' ? 'Servicio' : 'Producto físico';

  // ── FASE 1: dry_run=true — preview sin tocar la BD ───────────────────────
  if (dry_run) {
    const lines = [
      `📦 Vista previa — Producto a crear`,
      `• Nombre: **${name.trim()}**`,
      `• Tipo: ${typeLabel}`,
      `• Precio base: ${fmtCOP(priceInt)} (${vatLabel})`,
      `• Precio al cliente: **${fmtCOP(priceWithVat)}**`,
      cost != null ? `• Costo de compra: ${fmtCOP(costInt)}` : null,
      `• Categoría: ${categoryLabel}`,
      sku    ? `• SKU: ${sku}` : null,
      `• Control de inventario: ${track_inventory ? 'Sí' : 'No'}`,
      unit_of_measure ? `• Unidad: ${unit_of_measure}` : null,
      `\n¿Confirmas la creación de este producto?`,
    ].filter(Boolean);

    return {
      dry_run:        true,
      can_create:     true,
      preview: {
        name:            name.trim(),
        price:           priceInt,
        price_with_vat:  priceWithVat,
        vat_rate,
        cost:            costInt,
        category_id,
        category_label:  categoryLabel,
        sku:             sku || null,
        track_inventory,
        unit_of_measure: unit_of_measure || null,
        item_type,
      },
      message: lines.join('\n'),
    };
  }

  // ── FASE 2: dry_run=false — insertar en BD ────────────────────────────────
  const { data, error } = await supabase
    .from('products')
    .insert({
      organization_id: orgId,           // siempre del JWT, nunca del body
      name:            name.trim(),
      price:           priceInt,
      cost:            costInt,
      vat_rate,
      vat_included:    false,           // precio base sin IVA — el frontend suma el IVA al mostrar
      sku:             sku || null,
      category_id:     category_id || null,
      track_inventory,
      unit_of_measure: unit_of_measure || null,
      item_type:       item_type || 'product',
      is_active:       true,
      is_featured:     false,
    })
    .select()
    .single();

  if (error) return { error: `Error al crear el producto: ${error.message}` };

  // Audit log (fire-and-forget — no bloquear la respuesta)
  Promise.resolve(supabase.from('audit_log').insert({
    organization_id: orgId,
    user_id:         context.user_id,
    action:          'create_product_via_copilot',
    resource_type:   'product',
    resource_id:     data.id,
    new_values:      { name: data.name, price: data.price, vat_rate: data.vat_rate, item_type: data.item_type },
  })).catch(() => {});

  return {
    dry_run:    false,
    success:    true,
    product_id: data.id,
    message:    `✅ Producto **${data.name}** creado exitosamente.\n• Precio al cliente: **${fmtCOP(priceWithVat)}** (${vatLabel})\n• Categoría: ${categoryLabel}\n• ID: ${data.id.slice(0, 8)}…\n\nYa puedes buscarlo en el POS usando su nombre${sku ? ` o SKU "${sku}"` : ''}.`,
    product:    data,
  };
}

// =============================================================================
// HANDLER: transfer_stock — Tool 15
// Transfiere stock de un producto entre dos sucursales de la misma organización.
// SIEMPRE llamar con dry_run=true primero, luego dry_run=false tras confirmación.
// =============================================================================
async function transferStock(
  { dry_run = true, product_name, from_branch_name, to_branch_name, quantity, reason },
  context
) {
  const orgId    = context.organization_id;
  const supabase = context.supabase;

  if (!orgId)         return { error: 'DIAGNÓSTICO: organization_id es undefined en contexto.' };
  if (!product_name?.trim())    return { error: 'El nombre del producto es obligatorio.' };
  if (!from_branch_name?.trim()) return { error: 'El nombre de la sucursal origen es obligatorio.' };
  if (!to_branch_name?.trim())   return { error: 'El nombre de la sucursal destino es obligatorio.' };
  if (typeof quantity !== 'number' || quantity <= 0) return { error: 'La cantidad debe ser un número mayor que 0.' };

  const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;

  // ── 1. Buscar producto por nombre (fuzzy) ──────────────────────────────────
  const { data: product } = await supabase
    .from('products')
    .select('id, name, track_inventory, unit_of_measure')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .ilike('name', `%${product_name.trim()}%`)
    .limit(1)
    .maybeSingle();

  if (!product) return { error: `No se encontró ningún producto activo con el nombre "${product_name}".` };
  if (!product.track_inventory) {
    return { error: `El producto "${product.name}" no tiene control de stock activado. Solo se pueden transferir productos con track_inventory=true.` };
  }

  // ── 2. Buscar sucursales por nombre (fuzzy) ────────────────────────────────
  const { data: fromBranch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('organization_id', orgId)
    .ilike('name', `%${from_branch_name.trim()}%`)
    .limit(1)
    .maybeSingle();

  if (!fromBranch) return { error: `No se encontró ninguna sucursal con el nombre "${from_branch_name}".` };

  const { data: toBranch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('organization_id', orgId)
    .ilike('name', `%${to_branch_name.trim()}%`)
    .limit(1)
    .maybeSingle();

  if (!toBranch) return { error: `No se encontró ninguna sucursal con el nombre "${to_branch_name}".` };

  if (fromBranch.id === toBranch.id) {
    return { error: 'La sucursal origen y destino no pueden ser la misma.' };
  }

  // ── 3. Consultar stock actual en ambas sucursales ──────────────────────────
  const { data: fromInv } = await supabase
    .from('inventory')
    .select('quantity, average_cost')
    .eq('branch_id', fromBranch.id)
    .eq('product_id', product.id)
    .maybeSingle();

  const { data: toInv } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('branch_id', toBranch.id)
    .eq('product_id', product.id)
    .maybeSingle();

  const fromQty    = fromInv?.quantity ?? 0;
  const toQty      = toInv?.quantity   ?? 0;
  const avgCost    = fromInv?.average_cost ?? 0;
  const unit       = product.unit_of_measure || 'unidad(es)';
  const qtyRounded = Math.round(quantity * 100) / 100; // Preservar decimales si aplica

  if (fromQty < qtyRounded) {
    return {
      error: `Stock insuficiente. "${fromBranch.name}" solo tiene **${fromQty} ${unit}** de "${product.name}" — no puede transferir ${qtyRounded}.`,
      current_stock: fromQty,
    };
  }

  // ── 4. dry_run=true → Preview, nunca toca la BD ───────────────────────────
  if (dry_run) {
    return {
      dry_run:     true,
      can_transfer: true,
      preview: {
        product_id:    product.id,
        product_name:  product.name,
        from_branch_id:   fromBranch.id,
        from_branch_name: fromBranch.name,
        to_branch_id:     toBranch.id,
        to_branch_name:   toBranch.name,
        quantity:         qtyRounded,
        unit,
        from_stock_before: fromQty,
        from_stock_after:  fromQty - qtyRounded,
        to_stock_before:   toQty,
        to_stock_after:    toQty + qtyRounded,
        reason:           reason || null,
      },
      message: [
        `Aquí está el resumen del traslado a realizar:`,
        `| Campo | Detalle |`,
        `|---|---|`,
        `| Producto | ${product.name} |`,
        `| Origen | ${fromBranch.name} |`,
        `| Destino | ${toBranch.name} |`,
        `| Cantidad | ${qtyRounded} ${unit} |`,
        `| Stock origen después | ${fromQty - qtyRounded} ${unit} (antes: ${fromQty}) |`,
        `| Stock destino después | ${toQty + qtyRounded} ${unit} (antes: ${toQty}) |`,
        reason ? `| Motivo | ${reason} |` : null,
        ``,
        `¿Confirmas el traslado de stock?`,
      ].filter(l => l !== null).join('\n'),
    };
  }

  // ── 5. dry_run=false → Ejecutar transferencia ─────────────────────────────
  const transferRef = `TRF-${Date.now()}`;

  // Decrementar origen
  await supabase.from('inventory').upsert({
    branch_id:    fromBranch.id,
    product_id:   product.id,
    quantity:     fromQty - qtyRounded,
    average_cost: avgCost,
    updated_at:   new Date().toISOString(),
  });

  // Incrementar destino
  await supabase.from('inventory').upsert({
    branch_id:    toBranch.id,
    product_id:   product.id,
    quantity:     toQty + qtyRounded,
    average_cost: avgCost,       // propagar el costo promedio del origen
    updated_at:   new Date().toISOString(),
  });

  // Movimiento SALIDA en origen
  await supabase.from('inventory_movements').insert({
    branch_id:      fromBranch.id,
    product_id:     product.id,
    movement_type:  'transfer_out',
    quantity:       -qtyRounded,
    unit_cost:      Math.round(avgCost),
    reference_type: 'ai_transfer',
    reference_id:   transferRef,
    notes:          reason || null,
  });

  // Movimiento ENTRADA en destino
  await supabase.from('inventory_movements').insert({
    branch_id:      toBranch.id,
    product_id:     product.id,
    movement_type:  'transfer_in',
    quantity:       qtyRounded,
    unit_cost:      Math.round(avgCost),
    reference_type: 'ai_transfer',
    reference_id:   transferRef,
    notes:          reason || null,
  });

  // Audit log (fire-and-forget)
  Promise.resolve(supabase.from('audit_log').insert({
    organization_id: orgId,
    user_id:         context.user_id,
    action:          'transfer_stock_via_copilot',
    resource_type:   'inventory',
    resource_id:     product.id,
    new_values: {
      product_name:     product.name,
      from_branch:      fromBranch.name,
      to_branch:        toBranch.name,
      quantity:         qtyRounded,
      reference:        transferRef,
      reason:           reason || null,
    },
  })).catch(() => {});

  return {
    dry_run:      false,
    success:      true,
    reference:    transferRef,
    message:      `✅ Traslado completado exitosamente.\n• **${qtyRounded} ${unit}** de **${product.name}** movidas de "${fromBranch.name}" → "${toBranch.name}"\n• Stock ${fromBranch.name}: ${fromQty} → **${fromQty - qtyRounded} ${unit}**\n• Stock ${toBranch.name}: ${toQty} → **${toQty + qtyRounded} ${unit}**\n• Referencia: ${transferRef}`,
  };
}


// =============================================================================
// HANDLERS TOOLS 16-20: CO-PILOTO EXPANSION
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 16: getSalesSummary
// Consulta ventas de hoy, ayer, semana o mes via /reports/period
// ─────────────────────────────────────────────────────────────────────────────
async function getSalesSummary({ period = 'today' }, context) {
  const { supabase } = context;
  const orgId    = context.organization_id;
  const branchId = context.branch_id;

  // Calcular rango de fechas en hora Colombia (UTC-5)
  const nowCO = new Date(Date.now() - 5 * 3600000);
  const todayStr = nowCO.toISOString().slice(0, 10);

  let fromDate, toDate, labelPeriod;
  let fromPrev, toPrev; // período anterior para comparativa

  if (period === 'today') {
    fromDate = toDate = todayStr;
    const yd = new Date(nowCO); yd.setDate(yd.getDate() - 1);
    fromPrev = toPrev = yd.toISOString().slice(0, 10);
    labelPeriod = 'Hoy';
  } else if (period === 'yesterday') {
    const yd = new Date(nowCO); yd.setDate(yd.getDate() - 1);
    fromDate = toDate = yd.toISOString().slice(0, 10);
    const dd = new Date(nowCO); dd.setDate(dd.getDate() - 2);
    fromPrev = toPrev = dd.toISOString().slice(0, 10);
    labelPeriod = 'Ayer';
  } else if (period === 'week') {
    const dow = nowCO.getDay(); // 0=Sun
    const monday = new Date(nowCO); monday.setDate(nowCO.getDate() - (dow === 0 ? 6 : dow - 1));
    fromDate = monday.toISOString().slice(0, 10);
    toDate   = todayStr;
    const prevMon = new Date(monday); prevMon.setDate(monday.getDate() - 7);
    const prevSun = new Date(monday); prevSun.setDate(monday.getDate() - 1);
    fromPrev = prevMon.toISOString().slice(0, 10);
    toPrev   = prevSun.toISOString().slice(0, 10);
    labelPeriod = 'Esta semana';
  } else { // month
    fromDate = `${todayStr.slice(0, 7)}-01`;
    toDate   = todayStr;
    const prevMonth = new Date(nowCO); prevMonth.setDate(1); prevMonth.setMonth(prevMonth.getMonth() - 1);
    fromPrev = prevMonth.toISOString().slice(0, 7) + '-01';
    const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
    toPrev   = lastDay.toISOString().slice(0, 10);
    labelPeriod = 'Este mes';
  }

  // Construir query base sobre orders
  const buildQuery = (from, to) => {
    let q = supabase
      .from('orders')
      .select('total, payment_method, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('created_at', `${from}T05:00:00.000Z`) // 00:00 CO = 05:00 UTC
      .lte('created_at', `${to}T28:59:59.999Z`);  // extendido para cubrir todo el día CO
    if (branchId) q = q.eq('branch_id', branchId);
    return q;
  };

  const [{ data: current }, { data: prev }] = await Promise.all([
    buildQuery(fromDate, toDate),
    buildQuery(fromPrev, toPrev),
  ]);

  const sumRevenue = (rows) => (rows || []).reduce((s, r) => s + (r.total || 0), 0);
  const currentRevenue = sumRevenue(current);
  const prevRevenue    = sumRevenue(prev);
  const currentOrders  = (current || []).length;
  const avgTicket      = currentOrders > 0 ? Math.round(currentRevenue / currentOrders) : 0;
  const delta          = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null;

  // Hora pico
  const hourCounts = {};
  (current || []).forEach(r => {
    const h = new Date(new Date(r.created_at).getTime() - 5 * 3600000).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.keys(hourCounts).length
    ? Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;
  const deltaStr = delta !== null
    ? (parseFloat(delta) >= 0 ? `📈 +${delta}%` : `📉 ${delta}%`) + ' vs período anterior'
    : '';

  return {
    success:       true,
    period:        labelPeriod,
    from_date:     fromDate,
    to_date:       toDate,
    total_revenue: currentRevenue,
    total_orders:  currentOrders,
    avg_ticket:    avgTicket,
    peak_hour:     peakHour !== null ? `${peakHour}:00` : null,
    delta_pct:     delta,
    message: [
      `📊 **${labelPeriod}** (${fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`})`,
      `• Ventas totales: **${fmtCOP(currentRevenue)}** ${deltaStr}`,
      `• Órdenes: **${currentOrders}**`,
      `• Ticket promedio: **${fmtCOP(avgTicket)}**`,
      peakHour !== null ? `• Hora pico: **${peakHour}:00 – ${parseInt(peakHour) + 1}:00** (${hourCounts[peakHour]} órdenes)` : '',
    ].filter(Boolean).join('\n'),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 17: getRetentionSummary
// Cuenta clientes por segmento y trae cumpleaños del día
// ─────────────────────────────────────────────────────────────────────────────
async function getRetentionSummary({ include_birthdays = true, top_dormant = 3 }, context) {
  const { supabase } = context;
  const orgId = context.organization_id;

  // Traer clientes con su última compra
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, birth_date, last_purchase_date, total_spent, visit_count')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const now = new Date();
  const segments = { vip: [], activo: [], en_riesgo: [], dormido: [] };

  (customers || []).forEach(c => {
    const days = c.last_purchase_date
      ? Math.floor((now - new Date(c.last_purchase_date)) / 86400000)
      : 999;
    const allSpends = (customers || []).map(x => x.total_spent || 0).sort((a, b) => b - a);
    const top10Idx  = Math.floor(allSpends.length * 0.10);
    const vipThresh = allSpends[top10Idx] || 0;
    const isVip     = (c.total_spent >= vipThresh && vipThresh > 0) || (c.visit_count || 0) >= 10;

    if (isVip)         segments.vip.push(c);
    else if (days <= 30)   segments.activo.push(c);
    else if (days <= 60)   segments.en_riesgo.push(c);
    else                   segments.dormido.push(c);
  });

  const total = (customers || []).length;
  const retentionRate = total > 0
    ? Math.round(((segments.vip.length + segments.activo.length) / total) * 100)
    : 0;

  // Cumpleaños hoy
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const birthdays = include_birthdays
    ? (customers || []).filter(c => c.birth_date && c.birth_date.slice(5) === todayMD)
    : [];

  // Top dormidos para contactar
  const topDormant = segments.dormido
    .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    .slice(0, top_dormant);

  return {
    success: true,
    total_customers: total,
    retention_rate: retentionRate,
    segments: {
      vip:       segments.vip.length,
      activo:    segments.activo.length,
      en_riesgo: segments.en_riesgo.length,
      dormido:   segments.dormido.length,
    },
    birthdays_today: birthdays.map(c => ({ name: c.name, phone: c.phone })),
    top_dormant_to_contact: topDormant.map(c => ({ name: c.name, phone: c.phone, total_spent: c.total_spent })),
    message: [
      `👥 **Resumen de clientes** — ${total} total`,
      `• Tasa de retención: **${retentionRate}%**`,
      `• 🌟 VIP: ${segments.vip.length} | ✅ Activos: ${segments.activo.length} | ⚠️ En riesgo: ${segments.en_riesgo.length} | 😴 Dormidos: ${segments.dormido.length}`,
      birthdays.length ? `• 🎂 Cumpleaños hoy: **${birthdays.map(b => b.name).join(', ')}**` : '',
      topDormant.length ? `• Para reactivar: ${topDormant.map(d => d.name).join(', ')}` : '',
    ].filter(Boolean).join('\n'),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 18: closeDayReport
// Genera el resumen ejecutivo del día y opcionalmente lo envía por email
// ─────────────────────────────────────────────────────────────────────────────
async function closeDayReport({ send_email = false, date }, context) {
  const { supabase } = context;
  const orgId    = context.organization_id;
  const branchId = context.branch_id;

  const nowCO     = new Date(Date.now() - 5 * 3600000);
  const targetDay = date || nowCO.toISOString().slice(0, 10);

  // Ventas del día
  let q = supabase
    .from('orders')
    .select('total, payment_method, created_at, order_items(product_name, quantity, price)')
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .gte('created_at', `${targetDay}T05:00:00.000Z`)
    .lte('created_at', `${targetDay}T28:59:59.999Z`);
  if (branchId) q = q.eq('branch_id', branchId);

  const { data: orders } = await q;

  const totalRevenue = (orders || []).reduce((s, o) => s + (o.total || 0), 0);
  const totalOrders  = (orders || []).length;
  const avgTicket    = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Métodos de pago
  const payMethods = {};
  (orders || []).forEach(o => {
    const m = o.payment_method || 'otro';
    payMethods[m] = (payMethods[m] || 0) + (o.total || 0);
  });

  // Top productos del día
  const prodSales = {};
  (orders || []).forEach(o => {
    (o.order_items || []).forEach(item => {
      const k = item.product_name;
      if (!prodSales[k]) prodSales[k] = { qty: 0, revenue: 0 };
      prodSales[k].qty     += item.quantity || 1;
      prodSales[k].revenue += (item.price || 0) * (item.quantity || 1);
    });
  });
  const topProducts = Object.entries(prodSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;

  const summaryLines = [
    `📋 **Cierre del día — ${targetDay}**`,
    ``,
    `💰 Ingresos totales: **${fmtCOP(totalRevenue)}**`,
    `🧾 Órdenes procesadas: **${totalOrders}**`,
    `📊 Ticket promedio: **${fmtCOP(avgTicket)}**`,
    ``,
    `💳 Por método de pago:`,
    ...Object.entries(payMethods).map(([m, v]) => `   • ${m}: ${fmtCOP(v)}`),
    ``,
    topProducts.length ? `🏆 Productos más vendidos:` : '',
    ...topProducts.map(([name, s], i) => `   ${i + 1}. ${name} — ${s.qty} und. / ${fmtCOP(s.revenue)}`),
  ].filter(l => l !== null);

  // Envío por email si se solicita
  let emailSent = false;
  if (send_email) {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_email, name')
        .eq('id', orgId)
        .single();

      if (org?.owner_email) {
        // Fire-and-forget via el endpoint interno de email
        fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/reports/daily/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: orgId,
            branch_id:       branchId,
            date:            targetDay,
            to_email:        org.owner_email,
          }),
        }).catch(() => {});
        emailSent = true;
      }
    } catch { /* no bloquear */ }
  }

  return {
    success:        true,
    date:           targetDay,
    total_revenue:  totalRevenue,
    total_orders:   totalOrders,
    avg_ticket:     avgTicket,
    payment_methods: payMethods,
    top_products:   topProducts.map(([name, s]) => ({ name, qty: s.qty, revenue: s.revenue })),
    email_sent:     emailSent,
    message:        summaryLines.join('\n') + (emailSent ? '\n\n📧 Resumen enviado al email del propietario.' : ''),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 19: getTopProducts
// Top N productos más vendidos en el período
// ─────────────────────────────────────────────────────────────────────────────
async function getTopProducts({ period = 'week', limit = 5 }, context) {
  const { supabase } = context;
  const orgId    = context.organization_id;
  const branchId = context.branch_id;

  const nowCO    = new Date(Date.now() - 5 * 3600000);
  const todayStr = nowCO.toISOString().slice(0, 10);
  let fromDate, labelPeriod;

  if (period === 'today') {
    fromDate = todayStr; labelPeriod = 'Hoy';
  } else if (period === 'week') {
    const dow = nowCO.getDay();
    const monday = new Date(nowCO); monday.setDate(nowCO.getDate() - (dow === 0 ? 6 : dow - 1));
    fromDate = monday.toISOString().slice(0, 10); labelPeriod = 'Esta semana';
  } else {
    fromDate = `${todayStr.slice(0, 7)}-01`; labelPeriod = 'Este mes';
  }

  // Obtener order_items con join a orders (solo paid y en rango)
  let q = supabase
    .from('order_items')
    .select('product_name, product_id, quantity, price, orders!inner(organization_id, branch_id, status, created_at)')
    .eq('orders.organization_id', orgId)
    .eq('orders.status', 'paid')
    .gte('orders.created_at', `${fromDate}T05:00:00.000Z`);
  if (branchId) q = q.eq('orders.branch_id', branchId);

  const { data: items } = await q;

  // Agrupar
  const prodMap = {};
  (items || []).forEach(item => {
    const k = item.product_id || item.product_name;
    if (!prodMap[k]) prodMap[k] = { name: item.product_name, qty: 0, revenue: 0 };
    prodMap[k].qty     += item.quantity || 1;
    prodMap[k].revenue += (item.price || 0) * (item.quantity || 1);
  });

  const topList = Object.values(prodMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, Math.min(limit, 10));

  const totalRevenue = topList.reduce((s, p) => s + p.revenue, 0);
  const fmtCOP = n => `$${Math.round(n).toLocaleString('es-CO')}`;

  return {
    success:    true,
    period:     labelPeriod,
    products:   topList.map((p, i) => ({
      rank:    i + 1,
      name:    p.name,
      qty:     p.qty,
      revenue: p.revenue,
      share_pct: totalRevenue > 0 ? Math.round(p.revenue / totalRevenue * 100) : 0,
    })),
    message: [
      `🏆 **Top ${topList.length} productos — ${labelPeriod}**`,
      ...topList.map((p, i) =>
        `${i + 1}. **${p.name}** — ${p.qty} und. / ${fmtCOP(p.revenue)} (${totalRevenue > 0 ? Math.round(p.revenue / totalRevenue * 100) : 0}%)`
      ),
    ].join('\n'),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TOOL 20: getBirthdayAlert
// Clientes con cumpleaños hoy y en los próximos N días
// ─────────────────────────────────────────────────────────────────────────────
async function getBirthdayAlert({ days_ahead = 7 }, context) {
  const { supabase } = context;
  const orgId = context.organization_id;

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, birth_date')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .not('birth_date', 'is', null);

  const now = new Date();
  const toDay = (d) => {
    const dt = new Date(d);
    return new Date(now.getFullYear(), dt.getMonth(), dt.getDate());
  };
  const todayNorm = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todayBirthdays  = [];
  const upcomingBirthdays = [];

  (customers || []).forEach(c => {
    if (!c.birth_date) return;
    const bDay = toDay(c.birth_date);
    const diff = Math.floor((bDay - todayNorm) / 86400000);
    if (diff === 0) todayBirthdays.push(c);
    else if (diff > 0 && diff <= days_ahead) upcomingBirthdays.push({ ...c, days_until: diff });
  });

  upcomingBirthdays.sort((a, b) => a.days_until - b.days_until);

  const lines = [`🎂 **Alertas de cumpleaños**`];
  if (todayBirthdays.length) {
    lines.push(`\n**Hoy:** ${todayBirthdays.map(c => c.name).join(', ')}`);
  } else {
    lines.push(`\nHoy no hay cumpleaños.`);
  }
  if (upcomingBirthdays.length) {
    lines.push(`\n**Próximos ${days_ahead} días:**`);
    upcomingBirthdays.forEach(c => {
      lines.push(`• ${c.name} — en ${c.days_until} día(s)`);
    });
  }

  return {
    success:    true,
    today:      todayBirthdays.map(c => ({ name: c.name, phone: c.phone })),
    upcoming:   upcomingBirthdays.map(c => ({ name: c.name, phone: c.phone, days_until: c.days_until })),
    message:    lines.join('\n'),
  };
}


/*
EJEMPLO 1: Analizar factura de proveedor
─────────────────────────────────────────
const result = await runFerzuAgent(
  "Analiza esta factura de Colanta y registra los productos en el inventario",
  [],
  { organization_id, branch_id, business_type: 'minimarket', ... },
  MODELS.COMPLEX  // Vision + razonamiento
);
// → La IA llama a analyze_supplier_invoice()
// → Luego llama a create_ai_proposal(type='inventory_entry')
// → El usuario ve el toast "¿Aprobar ingreso de 23 productos?" y hace clic en "Aprobar"
// → executeApprovedProposal() actualiza el inventario con los cálculos del backend

EJEMPLO 2: Consulta financiera en lenguaje natural
───────────────────────────────────────────────────
const result = await runFerzuAgent(
  "¿Cuánto vendí esta semana y cuál es mi producto más rentable?",
  [],
  context,
  MODELS.FAST  // Haiku es suficiente para consultas simples
);
// → La IA llama a query_business_data(type='daily_sales')
// → La IA llama a query_business_data(type='product_profitability')
// → Responde con un análisis en lenguaje natural basado en los datos reales

EJEMPLO 3: Detectar mermas
───────────────────────────
// El backend corre este análisis automáticamente cada noche (cron job)
const result = await runFerzuAgent(
  `Analiza los siguientes datos de los últimos 7 días y detecta anomalías:
  Datos de ventas: ${JSON.stringify(salesData)}
  Movimientos de inventario: ${JSON.stringify(inventoryMovements)}`,
  [],
  context,
  MODELS.COMPLEX
);
// → La IA llama a detect_inventory_anomalies()
// → El backend crea alertas en system_alerts
// → El dueño ve las alertas en su dashboard al día siguiente
*/
