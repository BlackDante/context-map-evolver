// Strategic enrichment: subdomains, Cynefin domains and
// the key-questions heuristic. Best viewed on L1.

import { context, map } from 'context-map-evolver';

const kyc = context('KYC', {
  at: [170, 180], // inputs on the left
  subdomain: 'supporting',
  cynefin: 'complicated',
  questions: ['Is the applicant who they claim to be?'],
});

const pricing = context('Pricing', {
  at: [170, 600],
  subdomain: 'core',
  cynefin: 'complicated',
  questions: ['What interest rate and fees apply to this risk?'],
});

const underwriting = context('Underwriting', {
  at: [680, 380], // the hub, centre stage
  subdomain: 'core',
  cynefin: 'complex',
  questions: [
    'Should we lend to this applicant, and on what terms?',
    'What is the probability of default?',
  ],
});

const notifications = context('Notifications', {
  at: [1180, 380], // output on the right
  subdomain: 'generic',
  cynefin: 'clear',
  questions: ['How and when do we reach the customer?'],
});

kyc.upstreamOf(underwriting, { type: 'customer-supplier', upstream: 'OHS', downstream: 'ACL' });
pricing.upstreamOf(underwriting, { type: 'partnership' });
underwriting.upstreamOf(notifications, { type: 'conformist' });

export default map('Strategic map · lending', kyc, pricing, underwriting, notifications);
