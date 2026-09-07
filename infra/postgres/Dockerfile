FROM postgres:16-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends pgbackrest ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /var/lib/pgbackrest /var/log/pgbackrest && chown postgres:postgres /var/lib/pgbackrest /var/log/pgbackrest
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
