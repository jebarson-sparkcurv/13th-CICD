#!/bin/bash
# Recovers PostgreSQL after container reset wipes apt packages.
set -e
if ! ls /etc/init.d/ | grep -q postgresql; then
  echo "PostgreSQL missing — reinstalling..."
  apt-get install -y postgresql postgresql-contrib -qq
fi
service postgresql start || true
sleep 3
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='construction_db'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE construction_db;"
supervisorctl restart backend
sleep 8
curl -s -o /dev/null -w "backend: %{http_code}\n" http://localhost:8001/api/
