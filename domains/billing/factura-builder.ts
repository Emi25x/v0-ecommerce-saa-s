/**
 * Builds the parameter object for buildFacturaHTML from a factura + arca_config pair.
 * Centralizes the mapping so PDF route and ML upload route don't duplicate it.
 */

/** Normalize a raw invoice item ensuring subtotal/iva are calculated */
function normalizeItem(it: any) {
  const qty      = Number(it.cantidad        || 1)
  const price    = Number(it.precio_unitario || it.precio || 0)
  const alicuota = Number(it.alicuota_iva    || 0)
  const subtotal = it.subtotal != null ? Number(it.subtotal) : qty * price
  const iva      = it.iva      != null ? Number(it.iva)      : Math.round(subtotal * (alicuota / 100) * 100) / 100
  return {
    descripcion:     it.descripcion || it.titulo || "",
    cantidad:        qty,
    precio_unitario: price,
    alicuota_iva:    alicuota,
    subtotal,
    iva,
  }
}

/**
 * Converts a factura row (with nested arca_config) into the params expected by buildFacturaHTML.
 * @param factura  – DB row from `facturas` table
 * @param config   – DB row from `arca_config` table (the factura's arca_config)
 */
export function buildFacturaHtmlParams(factura: any, config: any) {
  return {
    razon_social:           config.razon_social,
    cuit:                   config.cuit,
    domicilio_fiscal:       config.domicilio_fiscal      || "",
    condicion_iva:          config.condicion_iva         || config.tipo_emisor,
    punto_venta:            factura.punto_venta,
    logo_url:               config.logo_url              || undefined,
    telefono:               config.telefono              || undefined,
    email:                  config.email                 || undefined,
    web:                    config.web                   || undefined,
    instagram:              config.instagram             || undefined,
    facebook:               config.facebook              || undefined,
    whatsapp:               config.whatsapp              || undefined,
    nota_factura:           config.nota_factura          || undefined,
    datos_pago:             config.datos_pago            || undefined,
    factura_opciones:       config.factura_opciones      || undefined,
    tipo_comprobante:       factura.tipo_comprobante,
    numero:                 factura.numero,
    fecha_emision:          factura.fecha,
    cae:                    factura.cae,
    cae_vto:                (factura.cae_vencimiento     || "").replace(/-/g, ""),
    receptor_nombre:        factura.razon_social_receptor,
    receptor_tipo_doc:      factura.tipo_doc_receptor,
    receptor_nro_doc:       factura.nro_doc_receptor,
    receptor_condicion_iva: factura.receptor_condicion_iva || "consumidor_final",
    receptor_domicilio:     factura.receptor_domicilio,
    items:                  (factura.items || []).map(normalizeItem),
    subtotal:               Number(factura.importe_neto),
    iva_105:                Number(factura.importe_iva_105),
    iva_21:                 Number(factura.importe_iva_21),
    iva_27:                 Number(factura.importe_iva_27),
    total:                  Number(factura.importe_total),
    moneda:                 factura.moneda               || "PES",
  }
}
