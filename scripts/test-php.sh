#!/usr/bin/env bash
#
# Run the WordPress integration tests inside wp-env's tests container.
#
# Two version pins are load-bearing.
#
# The tests container ships PHPUnit 10 globally, but the WordPress core test
# suite still calls `PHPUnit\Util\Test::parseTestMethodAnnotations()`, which
# PHPUnit 10 removed. Every test errors before running. composer.json therefore
# pins phpunit ^9.6 and this invokes the local vendor binary rather than the one
# on PATH.
#
# And the core bootstrap resolves yoast/phpunit-polyfills relative to its own
# location, which lands outside the plugin, so tests/php/bootstrap.php defines
# WP_TESTS_PHPUNIT_POLYFILLS_PATH to point at ours.
#
# Composer runs inside the container too, so no host Composer is needed.
#
# Usage: npm run test:php [-- --filter Something]

set -euo pipefail

PLUGIN_DIR=/var/www/html/wp-content/plugins/gll-info

npx wp-env run tests-cli /bin/bash -c "
	cd $PLUGIN_DIR &&
	if [ ! -x vendor/bin/phpunit ]; then
		composer install --no-interaction --quiet
	fi &&
	./vendor/bin/phpunit $*
"
