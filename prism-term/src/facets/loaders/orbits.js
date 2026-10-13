// Orbits & shapes — picture spinners: phases, clocks, globes and bouncing balls.
import { spinnerFacet } from './_kit.js';

const C = 'Orbits & Shapes';

export default [
  spinnerFacet({ id: 'loaders-moon', spin: 'moon', title: 'Moon Phases', category: C, order: 10,
    description: 'The moon waxing and waning through eight phases — perfect for long-running, overnight jobs.',
    tags: ['emoji', 'moon', 'phases'], labels: ['Running nightly backup…', 'Snapshotting volumes…'] }),
  spinnerFacet({ id: 'loaders-clock', spin: 'clock', title: 'Clock', category: C, order: 20,
    description: 'A clock face ticking through twelve hours — time is passing, literally.',
    tags: ['emoji', 'clock', 'time'], labels: ['Waiting for cron window…', 'Sleeping until 02:00…'] }),
  spinnerFacet({ id: 'loaders-earth', spin: 'earth', title: 'Globe', category: C, order: 30,
    description: 'The globe turning to show each continent in turn — for network and replication waits.',
    tags: ['emoji', 'globe', 'network'], labels: ['Replicating to eu-west…', 'Propagating DNS…'] }),
  spinnerFacet({ id: 'loaders-hourglass', spin: 'hourglass', title: 'Hourglass', category: C, order: 40,
    description: 'An hourglass flipping between running and empty — the universal "this will take a while".',
    tags: ['emoji', 'hourglass', 'wait'], labels: ['Waiting for approval…', 'Queued behind 3 jobs…'] }),
  spinnerFacet({ id: 'loaders-heart', spin: 'heart', title: 'Heartbeat', category: C, order: 50,
    description: 'An outlined heart beating solid and back — a liveness signal for watchers and daemons.',
    tags: ['heart', 'liveness', 'daemon'], labels: ['Monitoring health…', 'All checks passing…'] }),
  spinnerFacet({ id: 'loaders-bouncing-ball', spin: 'bouncingBall', name: 'bouncingBall', title: 'Bouncing Ball', category: C, order: 60,
    description: 'A ball bouncing wall to wall inside parentheses — the playful indeterminate bar.',
    tags: ['ball', 'bounce', 'indeterminate'], labels: ['Rebalancing partitions…', 'Shuffling data…'] }),
];
