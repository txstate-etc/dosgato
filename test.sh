docker compose -f docker-compose.test.yml down
docker compose -f docker-compose.test.yml up --remove-orphans --build --abort-on-container-exit --attach dosgato-test
