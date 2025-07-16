docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up --remove-orphans --build --abort-on-container-exit --exit-code-from dosgato-test
