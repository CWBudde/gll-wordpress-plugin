/**
 * One control for choosing which GLL file a block shows.
 *
 * This replaces fourteen copies — a `MediaUpload` in each block's placeholder and
 * another in each block's inspector panel — which had drifted apart in four ways
 * that mattered. Reconciling them was not a side effect of adding URL support; it
 * is what made "add the URL field to all seven blocks consistently" a change to
 * one file instead of a promise to remember seven times.
 *
 * The URL field commits on Apply, on Enter, and on blur after a change. IT NEVER
 * COMMITS ON A KEYSTROKE, AND IS NOT DEBOUNCED, and that is a decision rather
 * than an omission: a commit starts a download that can run to tens of megabytes,
 * and there is no debounce interval that is both quick enough to feel responsive
 * and long enough that `https://example.com/a` is never a real request. What a
 * debounce was reaching for — the field feeling alive — comes from validating on
 * every keystroke, which costs nothing because it touches no network.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';
import {
	MediaPlaceholder,
	MediaUpload,
	MediaUploadCheck,
} from '@wordpress/block-editor';
import { Button, Notice, TextControl } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { filterURLForDisplay } from '@wordpress/url';

import {
	GLL_ALLOWED_TYPES,
	fileNameFromUrl,
	validateGllUrl,
} from './file-source';
import type { GllFileSource } from './file-source';

interface FileSourceStatus {
	isLoading?: boolean;
	error?: Error | null;
	via?: 'direct' | 'proxy' | null;
}

interface FileSourceControlProps {
	variant: 'placeholder' | 'inspector';
	value: GllFileSource;
	onChange: ( next: GllFileSource ) => void;
	onRemove: () => void;
	onRetry?: () => void;
	icon?: JSX.Element | string;
	label?: string;
	instructions?: string;
	status?: FileSourceStatus;
	servedFromCache?: boolean;
	children?: JSX.Element | JSX.Element[];
}

/**
 * Turn a media object into the three attributes a block stores.
 *
 * `media.filename` is absent on media objects that arrive through some
 * REST-shaped paths, and six of the seven blocks used to write `undefined` into
 * a `type: "string"` attribute as a result — which serialises as an empty header
 * on the frontend. The two fallbacks are what the file viewer already did.
 *
 * @param {Object} media Media object from the picker.
 * @return {Object} The block's file attributes.
 */
export function fromMedia( media ): GllFileSource {
	return {
		fileId: media?.id || 0,
		fileUrl: media?.url || '',
		fileName: media?.filename || media?.title || '',
	};
}

/**
 * Turn a typed address into the three attributes a block stores.
 *
 * `fileId: 0` is what marks the file as external, everywhere downstream.
 *
 * @param {string} url Address of the file.
 * @return {Object} The block's file attributes.
 */
export function fromUrl( url ): GllFileSource {
	const trimmed = String( url || '' ).trim();

	return {
		fileId: 0,
		fileUrl: trimmed,
		fileName: fileNameFromUrl( trimmed ),
	};
}

/**
 * The address field and its Apply button.
 *
 * @param {Object}   props            Component props.
 * @param {string}   props.value      Current address.
 * @param {Function} props.onCommit   Called with a committed address.
 * @param {string}   props.buttonText Label for the commit button.
 * @return {JSX.Element} Control markup.
 */
function UrlField( { value, onCommit, buttonText } ) {
	const [ draft, setDraft ] = useState( value || '' );

	// Resync when the address changes from outside the field: an undo, or a media
	// library selection that replaced the external file.
	useEffect( () => {
		setDraft( value || '' );
	}, [ value ] );

	const check = validateGllUrl( draft );
	const blocked = 'error' === check.level;

	const commit = () => {
		if ( blocked && draft.trim() ) {
			return;
		}

		if ( draft.trim() !== ( value || '' ).trim() ) {
			onCommit( draft.trim() );
		}
	};

	return (
		<div className="gll-file-source__url">
			<TextControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				type="url"
				label={ __( 'Address of a GLL file', 'gll-info' ) }
				help={ check.message || undefined }
				placeholder="https://example.com/speaker.gll"
				value={ draft }
				onChange={ setDraft }
				onBlur={ commit }
				onKeyDown={ ( event ) => {
					if ( 'Enter' === event.key ) {
						event.preventDefault();
						commit();
					}
				} }
			/>
			<Button
				variant="secondary"
				onClick={ commit }
				disabled={ blocked }
				aria-disabled={ blocked }
			>
				{ buttonText }
			</Button>
		</div>
	);
}

/**
 * Explain a preview that only loaded because the server fetched it.
 *
 * The author cannot control the header this is about, so the message states what
 * was observed before it states what follows from it — and it says plainly which
 * of the two outcomes applies to this block, because they are genuinely
 * different. A block served from the stored summary still works for visitors; a
 * block that renders measurement data does not.
 *
 * @param {Object}   props                 Component props.
 * @param {string}   props.fileUrl         The address that failed to load directly.
 * @param {boolean}  props.servedFromCache Whether this block renders from the stored summary.
 * @param {Function} props.onRetry         Re-check callback, when the block offers one.
 * @return {JSX.Element} Notice markup.
 */
function ProxyNotice( { fileUrl, servedFromCache, onRetry } ) {
	let host = '';

	try {
		host = new URL( fileUrl ).host;
	} catch ( error ) {
		host = fileUrl;
	}

	return (
		<Notice status="warning" isDismissible={ false }>
			<p>
				<strong>
					{ __(
						'Preview loaded through your site, not directly.',
						'gll-info'
					) }
				</strong>{ ' ' }
				{ sprintf(
					/* translators: %s: host name of the site the file is on. */
					__(
						'Your browser could not fetch this file from %s, because that website does not allow other websites to read it.',
						'gll-info'
					),
					host
				) }
			</p>
			<p>
				{ servedFromCache
					? __(
							'Visitors will be served the stored summary of this file, so this page will still work. Nobody will see a change made to the file where it is hosted until you open this post again.',
							'gll-info'
					  )
					: __(
							'Visitors’ browsers will be blocked in the same way, and this block will show an error on the published page. Ask whoever hosts the file to allow your site to read it, or add the file to your media library instead.',
							'gll-info'
					  ) }
			</p>
			{ onRetry && (
				<Button variant="secondary" onClick={ onRetry }>
					{ __( 'Check again', 'gll-info' ) }
				</Button>
			) }
		</Notice>
	);
}

/**
 * Choose a GLL file from the media library or from another website.
 *
 * @param {Object}      props                 Component props.
 * @param {string}      props.variant         'placeholder' for an empty block, 'inspector' for the sidebar.
 * @param {Object}      props.value           Current `fileId`/`fileUrl`/`fileName`.
 * @param {Function}    props.onChange        Called with the full new triple.
 * @param {Function}    props.onRemove        Called to clear the file.
 * @param {Function}    props.onRetry         Optional re-check callback.
 * @param {JSX.Element} props.icon            Placeholder icon.
 * @param {string}      props.label           Placeholder title.
 * @param {string}      props.instructions    Placeholder instructions.
 * @param {Object}      props.status          Load state, so the control can explain it.
 * @param {boolean}     props.servedFromCache Whether the block renders from the stored summary.
 * @param {JSX.Element} props.children        Extra inspector content, e.g. the rebuild control.
 * @return {JSX.Element} Control markup.
 */
export default function FileSourceControl( {
	variant,
	value,
	onChange,
	onRemove,
	onRetry,
	icon,
	label,
	instructions,
	status,
	servedFromCache = false,
	children,
}: FileSourceControlProps ) {
	const { fileId, fileUrl, fileName } = value;
	const isExternal = ! fileId && Boolean( fileUrl );
	const check = fileUrl ? validateGllUrl( fileUrl ) : null;

	const proxied = 'proxy' === status?.via && isExternal;
	const warning =
		isExternal && 'warning' === check?.level ? check.message : '';

	if ( 'placeholder' === variant ) {
		return (
			<>
				<MediaPlaceholder
					icon={ icon as never }
					labels={ {
						title: label,
						instructions,
					} }
					allowedTypes={ GLL_ALLOWED_TYPES }
					accept=".gll"
					value={
						{
							id: fileId || undefined,
							src: fileUrl || undefined,
						} as never
					}
					onSelect={ ( media ) => onChange( fromMedia( media ) ) }
					onSelectURL={ ( url ) => onChange( fromUrl( url ) ) }
					multiple={ false }
				/>
				{ warning && (
					<Notice status="warning" isDismissible={ false }>
						{ warning }
					</Notice>
				) }
			</>
		);
	}

	return (
		<div className="gll-file-source">
			<div className="gll-file-info">
				<strong>{ __( 'Selected file:', 'gll-info' ) }</strong>
				<br />
				{ fileName || __( 'None', 'gll-info' ) }
				{ isExternal && (
					<>
						<br />
						<code className="gll-file-source__address">
							{ filterURLForDisplay( fileUrl, 40 ) }
						</code>
					</>
				) }
			</div>

			<MediaUploadCheck>
				<MediaUpload
					onSelect={ ( media ) => onChange( fromMedia( media ) ) }
					allowedTypes={ GLL_ALLOWED_TYPES }
					value={ fileId }
					render={ ( { open } ) => (
						<Button
							variant="secondary"
							className="gll-file-source__pick"
							onClick={ open }
						>
							{ fileId
								? __( 'Replace', 'gll-info' )
								: __(
										'Choose from media library',
										'gll-info'
								  ) }
						</Button>
					) }
				/>
			</MediaUploadCheck>

			<UrlField
				value={ isExternal ? fileUrl : '' }
				onCommit={ ( url ) =>
					url ? onChange( fromUrl( url ) ) : onRemove()
				}
				buttonText={
					isExternal
						? __( 'Update address', 'gll-info' )
						: __( 'Use an address instead', 'gll-info' )
				}
			/>

			{ warning && (
				<Notice status="warning" isDismissible={ false }>
					{ warning }
				</Notice>
			) }

			{ proxied && (
				<ProxyNotice
					fileUrl={ fileUrl }
					servedFromCache={ servedFromCache }
					onRetry={ onRetry }
				/>
			) }

			<Button
				variant="tertiary"
				isDestructive
				className="gll-file-source__remove"
				onClick={ onRemove }
			>
				{ __( 'Remove', 'gll-info' ) }
			</Button>

			{ children }
		</div>
	);
}
