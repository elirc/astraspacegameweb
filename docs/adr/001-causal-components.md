# Causal components and shared player-point locks

A village lock alone omits late cross-village effects: an overdue attack can schedule a return before its origin's already committed resource anchor. Player-wide points also influence morale. Sequences establish persisted tie-breakers, not commit order.

The planner reads due event dependencies and stationed support. It identifies players whose points or ownership can change through construction, siege, conquest or redirected returns. Those players join their dependent village histories into one graph node. Support dependencies conservatively do the same. Other villages remain separate nodes. The component includes origins, targets and original senders.

Transactions hold a shared world configuration lock, then acquire sorted player and village locks under a short admission mutex. Player-point readers use shared locks; potential points/ownership writers and command actors use exclusive locks. Village mutation always requires an exclusive village lock. A second plan checks for newly required players, villages or an upgrade from shared to exclusive access. Any expansion or contention rolls back before retry. Configuration changes and migrations require the exclusive world lock.

Within the admitted component, the application drains events by `(due_at,id)`, including newly generated effects that are already due. Commands refresh their database clock after admission and drain predecessors before validation. Idle state reads use one consistent MVCC snapshot; active reads use causal draining. Transaction tokens prevent stale plans from surviving pooled connection reuse.

The regression suite compares serial and eight-worker execution for 500 tied attacks and a mixed multi-village history. It also holds one component open while another commits, proves independent attacks against one owner's separate villages can share point locks, and proves later construction drains older point-dependent attacks first. The crash drill compares committed world state and reports after worker, database and Redis failures.

The indexed-neighbor planner was measured and removed after a slower load probe. Its applied migration remains immutable; a subsequent migration removes the unused index. The current graph protocol favors correctness, but its world-level dependency reads and write volume remain capacity costs. Adding workers is not a throughput guarantee. Production acceptance still requires the sustained measured load gate.
