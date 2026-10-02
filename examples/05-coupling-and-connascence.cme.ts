// The running example, grown from a hand-drawn map of a
// media-rights platform. Every level is encoded here, so
// the slider always has something to reveal.

import { context, map } from 'context-map-evolver';

const legal = context('Legal', {
  subdomain: 'core',
  cynefin: 'complex',
  questions: [
    'What constraints do we operate under?',
    'When can a license be used, and where?',
  ],
});

const availability = context('Availability', {
  subdomain: 'supporting',
  cynefin: 'complicated',
  questions: [
    'What resources do we have?',
    'What materials are we allowed to sell right now?',
  ],
});

const library = context('Library', {
  subdomain: 'generic',
  cynefin: 'clear',
  questions: [
    'What materials exist in the catalogue?',
    'Which actors / contributors are involved?',
  ],
});

const orders = context('Orders', {
  subdomain: 'core',
  cynefin: 'complicated',
  questions: ['What did the customer order, and is it fulfillable?'],
});

const payments = context('Payments', {
  subdomain: 'generic',
  cynefin: 'clear',
  questions: ['Was the customer charged successfully?'],
});

legal.promises('authoritative licensing rules').to(availability);
availability.promises('current sellable catalogue').to(library);

// --- relations (the context on the left is upstream, the argument downstream) ---

legal
  .upstreamOf(availability, {
    type: 'customer-supplier',
    upstream: 'OHS',
    downstream: 'ACL',
    integration: 'DNS + PL',
    coupling: 2, // heavy integration: counts double for Ca/Ce
  })
  .connascence('meaning', 'distant', 3) // a boundary can carry several kinds at once
  .connascence('value', 'distant', 2);

availability
  .upstreamOf(library, { type: 'conformist', downstream: 'CF', integration: 'Customer', coupling: 1 })
  .connascence('name', 'distant', 2);

// Orders consume the sellable catalogue from Availability
availability
  .upstreamOf(orders, { type: 'customer-supplier', upstream: 'OHS' })
  .connascence('name', 'distant', 2);

// TWO relations between the same pair, both Payments -> Orders:
//  1) Orders calls Payments to create a payment   (Payments exposes an OHS)
payments
  .upstreamOf(orders, { type: 'open-host-service', upstream: 'OHS', integration: 'create payment' })
  .connascence('type', 'distant', 2);
//  2) Payments later informs Orders that payment completed (customer/supplier)
payments
  .upstreamOf(orders, { type: 'customer-supplier', integration: 'payment completed' })
  .connascence('value', 'distant', 1);

export default map('Media Rights Platform', legal, availability, library, orders, payments);
