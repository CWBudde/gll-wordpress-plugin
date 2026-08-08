/**
 * HTML escaping for values that originate in a GLL file.
 *
 * The view scripts build their metadata and error panels as HTML strings and
 * assign them with innerHTML. Anything read out of the parsed file — source
 * labels above all — is attacker-controlled in the sense that uploading a GLL
 * is not the same as being trusted to author markup, so it has to be escaped
 * on the way in. The parent block already did this; this is the shared version.
 *
 * @package
 */

/**
 * Escape a value for safe interpolation into an HTML string.
 *
 * @param {*} value Value to escape; non-strings are coerced.
 * @return {string} Escaped text, empty for null/undefined.
 */
export function escapeHtml( value ) {
	if ( value === null || value === undefined ) {
		return '';
	}

	const div = document.createElement( 'div' );
	div.textContent = String( value );
	return div.innerHTML;
}

export default escapeHtml;
