# Lock contention and orphaned connections

Village mutations use transaction-scoped advisory locks. They disappear on commit, rollback or connection death; there is no permanent orphaned lock to delete. A causal component also holds player locks for point-dependent combat and support relationships. Independent components can run concurrently.

Inspect blockers with `pg_blocking_pids(pid)` and `pg_stat_activity`. Expected failed try-locks cause rollback and retry. Alerted retry exhaustion, long transactions or idle-in-transaction connections require investigation. Capture the query, application name and transaction age before terminating a confirmed abandoned backend with `pg_terminate_backend`.

Never terminate arbitrary database sessions to make a queue look shorter. After an intentional termination, verify affected events remain pending or are completely committed, then inspect resolver progress and reports. All application processes must use the shared lock protocol; direct aggregate writes are restricted to reviewed migrations and maintenance under the exclusive world lock.
