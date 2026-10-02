// Promise Theory (Mark Burgess): autonomous contexts make
// voluntary promises. promises() gives, uses() accepts;
// cooperation needs both. Impositions are forced. Best viewed on L2.

import { context, map } from 'context-map-evolver';

// pinned for a clean demo layout (Orders = hub)
const orders = context('Orders', { at: [360, 380], subdomain: 'core', cynefin: 'complicated' });
// adjacent to Carrier so their edge stays on the right
const warehouse = context('Warehouse', { at: [880, 680], subdomain: 'supporting', cynefin: 'complicated' });
const payments = context('Payments', { at: [80, 120], subdomain: 'generic', cynefin: 'clear' });
const carrier = context('Carrier', { at: [880, 120], subdomain: 'generic', cynefin: 'clear' });

orders.promises('an accepted order is valid and paid').to(warehouse);
// a use-promise (−): Orders relies on Payments, and says so explicitly
orders.uses('payment confirmation').from(payments).if('order total is positive');

warehouse.promises('a confirmed pick ships same day').to(orders).if('picked before 2pm');
warehouse.uses('label format').from(carrier);

// the matching (+) for Orders' (−) — together they make cooperation work
payments.promises('payment confirmation').to(orders);

carrier.promises('tracking updates').to(orders);
// not a promise: Carrier cannot promise on Warehouse's behalf
carrier.imposes('you must use our label format').on(warehouse);

warehouse.upstreamOf(orders, { type: 'partnership' });
payments.upstreamOf(orders, { type: 'customer-supplier' });
carrier.upstreamOf(orders, { type: 'conformist' });

export default map('Promise theory · fulfilment', orders, warehouse, payments, carrier);
