# `stacks-functional-tests`

> A repo for running functional tests on Stacks.

## Regtest

It's possible to use this repo side-by-side with the Stacks regtest environment.

1. Setup the `regtest-env` folder next to this repo.
2. Run the regtest environment OR configure the ENV to automatically start/stop the regtest environment.
  1. `REGTEST_DOWN_CMD` - The command to stop the regtest environment (e.g. `cd /regtest && docker compose down`).
  2. `REGTEST_UP_CMD` - The command to start the regtest environment (e.g. `cd /regtest && docker compose up -d`).
3. Run a test via Jest.
