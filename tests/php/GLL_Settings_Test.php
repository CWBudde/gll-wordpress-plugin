<?php
/**
 * Tests for the settings screen's sanitisers.
 *
 * The host allowlist is the one place an administrator can bound the plugin's
 * only outbound-fetch capability, so a sanitiser that silently dropped a valid
 * host — or silently kept an invalid one — would either disable the feature or
 * weaken the bound, and neither would be visible on the screen.
 *
 * @package
 */

/**
 * Tests for GLL_Settings.
 */
class GLL_Settings_Test extends WP_UnitTestCase {

	/**
	 * Clean up options the tests write.
	 */
	public function tear_down() {
		delete_option( GLL_Remote::ENABLED_OPTION );
		delete_option( GLL_Remote::HOSTS_OPTION );
		delete_option( GLL_Remote::MAX_MB_OPTION );

		parent::tear_down();
	}

	/**
	 * Plain host names survive, one per line.
	 */
	public function test_the_host_list_keeps_valid_hosts() {
		$this->assertSame(
			"files.example\ncdn.example.com",
			GLL_Settings::sanitize_hosts( "files.example\n cdn.example.com " )
		);
	}

	/**
	 * A pasted address is reduced to its host, because that is what an
	 * administrator will have in the clipboard.
	 */
	public function test_the_host_list_accepts_a_pasted_address() {
		$this->assertSame(
			'files.example',
			GLL_Settings::sanitize_hosts( 'https://files.example/speakers/a.gll' )
		);
	}

	/**
	 * Subdomain wildcards are supported.
	 */
	public function test_the_host_list_accepts_a_wildcard() {
		$this->assertSame( '*.cdn.example', GLL_Settings::sanitize_hosts( '*.cdn.example' ) );
	}

	/**
	 * Anything that is not a host name is dropped rather than stored to fail
	 * silently later.
	 */
	public function test_the_host_list_drops_what_is_not_a_host() {
		$this->assertSame(
			'files.example',
			GLL_Settings::sanitize_hosts( "files.example\nlocalhost\n127.0.0.1\n\n**\n-bad-" )
		);
	}

	/**
	 * Duplicates collapse and the list is bounded.
	 */
	public function test_the_host_list_is_deduplicated_and_capped() {
		$this->assertSame(
			'files.example',
			GLL_Settings::sanitize_hosts( "files.example\nFILES.EXAMPLE" )
		);

		$many = array();
		for ( $i = 0; $i < 80; $i++ ) {
			$many[] = 'host' . $i . '.example';
		}

		$this->assertCount(
			50,
			explode( "\n", GLL_Settings::sanitize_hosts( implode( "\n", $many ) ) )
		);
	}

	/**
	 * The size ceiling is clamped rather than trusted.
	 */
	public function test_the_size_ceiling_is_clamped() {
		$default = (int) ( GLL_Remote::MAX_BYTES / MB_IN_BYTES );

		$this->assertSame( 16, GLL_Settings::sanitize_max_mb( '16' ) );
		$this->assertSame( 512, GLL_Settings::sanitize_max_mb( 99999 ) );
		$this->assertSame( $default, GLL_Settings::sanitize_max_mb( 0 ) );
		$this->assertSame( $default, GLL_Settings::sanitize_max_mb( -5 ) );
	}

	/**
	 * The new settings share the existing option group, so one form and one
	 * submit button keep working.
	 */
	public function test_the_new_settings_join_the_existing_group() {
		// Called directly rather than through `admin_init`, which in this
		// environment reaches code that sends headers.
		GLL_Settings::register();

		$registered = get_registered_settings();

		foreach ( array( GLL_Remote::ENABLED_OPTION, GLL_Remote::HOSTS_OPTION, GLL_Remote::MAX_MB_OPTION ) as $option ) {
			$this->assertArrayHasKey( $option, $registered );
			$this->assertSame( 'gll_info_settings', $registered[ $option ]['group'] );
		}
	}

	/**
	 * The proxy is off until an administrator turns it on.
	 */
	public function test_the_proxy_is_off_until_it_is_switched_on() {
		$this->assertFalse( GLL_Remote::is_enabled() );

		update_option( GLL_Remote::ENABLED_OPTION, '1' );

		$this->assertTrue( GLL_Remote::is_enabled() );
	}

	/**
	 * The configured ceiling is what the proxy uses.
	 */
	public function test_the_configured_ceiling_reaches_the_proxy() {
		update_option( GLL_Remote::MAX_MB_OPTION, 8 );

		$this->assertSame( 8 * MB_IN_BYTES, GLL_Remote::max_bytes() );
	}
}
