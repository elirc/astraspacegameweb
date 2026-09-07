# Point-in-time recovery and failover

Never restore over the active world while clients or resolvers are connected. Put the world in maintenance, preserve the damaged cluster and archive, and restore into a new private cluster. Record the selected timestamp, last known good event and expected data loss with operator approval.

For pgBackRest, create the stanza, take daily full/base backups and archive every completed WAL segment. Monitor repository capacity and backup age. Keep at least seven full backups and copy/encrypt the repository off-host. Test archive retrieval as well as backup creation.

`pnpm test:recovery` runs the repository's isolated Docker drill. It takes a real base backup, writes records before and after a selected timestamp, restores a separate volume to that timestamp, and asserts only pre-target records survive. It then restores a streaming standby, acknowledges a `remote_apply` commit, kills the primary, promotes the standby and checks that commit survived. Results are written to `artifacts/chaos/recovery.json`.

The drill's project is `warband-drills`; PostgreSQL ports are 55433/55434. It does not stop, overwrite or restore the playable development database on 55432. Test credentials are intentionally local and must not be copied to production.

For a real incident, validate state, pending events and replay results on the restored cluster before switching the private database endpoint. Fence the old primary to prevent split brain. Rotate affected credentials if compromise is suspected. Resume one resolver first, check lag and reports, then restore the remaining roles. A whole-world PITR rollback loses all commits after the chosen point; do not use it for a single disputed battle.
