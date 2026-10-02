// Bare structure: contexts and relationships only — the same
// model as 01-minimal.cme, written in TypeScript. Best viewed on L0.

import { context, map } from 'context-map-evolver';

const sales = context('Sales');
const shipping = context('Shipping');
const billing = context('Billing');

// the context on the left is UPSTREAM, the argument is DOWNSTREAM
sales.upstreamOf(shipping, { type: 'customer-supplier' });
sales.upstreamOf(billing, { type: 'customer-supplier' });

export default map('Minimal map', sales, shipping, billing);
