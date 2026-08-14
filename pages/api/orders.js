import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { customer, items, payment, total } = req.body;

  // Validaciones básicas
  if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
    return res.status(400).json({ error: 'Faltan datos del cliente' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El pedido no tiene productos' });
  }

  try {
    // 1. Verificar stock disponible para cada producto
    for (const item of items) {
      const { data: product, error: prodError } = await supabase
        .from('products')
        .select('id, stock')
        .eq('id', item.id)
        .single();

      if (prodError) throw prodError;

      if (!product || product.stock < item.qty) {
        return res.status(400).json({
          error: `No hay suficiente stock de "${item.name}". Solo quedan ${product?.stock ?? 0} unidades.`
        });
      }
    }

    // 2. Crear el pedido
    const orderNumber = 'AK-' + Date.now().toString().slice(-6);
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_address: customer.address,
        payment_method: payment,
        total: total
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 3. Insertar los items del pedido
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      quantity: item.qty,
      price: item.price
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // 4. Descontar el stock de cada producto
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.id)
        .single();

      const newStock = Math.max(0, (product?.stock ?? 0) - item.qty);

      const { error: stockError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.id);

      if (stockError) throw stockError;
    }

    return res.status(201).json({
      success: true,
      order: {
        id: order.id,
        order_number: orderNumber,
        customer_email: customer.email,
        total: total
      }
    });
  } catch (error) {
    console.error('Error al crear pedido:', error.message);
    return res.status(500).json({ error: 'Error al procesar el pedido' });
  }
}
