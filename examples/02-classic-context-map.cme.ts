// A classic context map: the full range of DDD relationship
// patterns (OHS, PL, ACL, CF, conformist, customer-supplier),
// no enrichment. Best viewed on L0.

import { context, map } from 'context-map-evolver';

// pinned into a clean radial layout (Orders = hub) that fills the canvas
const erp = context('ERP', { at: [150, 110] });
const catalog = context('Catalog', { at: [150, 390] });
const identity = context('Identity', { at: [150, 740] });
const payments = context('Payments', { at: [650, 790] });
const orders = context('Orders', { at: [800, 410] });
const shipping = context('Shipping', { at: [1230, 230] });
const notifications = context('Notifications', { at: [1230, 610] });

identity.upstreamOf(orders, { type: 'open-host-service', upstream: 'OHS', downstream: 'CF' });
identity.upstreamOf(payments, { type: 'open-host-service', upstream: 'OHS', downstream: 'CF' });
erp.upstreamOf(catalog, { type: 'customer-supplier', downstream: 'ACL', integration: 'nightly sync' });
catalog.upstreamOf(orders, { type: 'customer-supplier', upstream: 'OHS', downstream: 'ACL' });
payments.upstreamOf(orders, { type: 'open-host-service', upstream: 'OHS', integration: 'create payment' });
orders.upstreamOf(shipping, { type: 'customer-supplier', upstream: 'PL' });
orders.upstreamOf(notifications, { type: 'conformist' });

export default map(
  'Classic context map · e-commerce',
  erp,
  catalog,
  identity,
  payments,
  orders,
  shipping,
  notifications,
);
