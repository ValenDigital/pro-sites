// Taxamo Module: Additional
var Taxamo = (function(my) {
    "use strict";
    var $ = my.$ || jQuery || null;

    var imsi_evidence = false;

    my.detectIMSI = function( imsi ) {
        $.post(
            prosites_checkout.ajax_url, {
                action: 'validate_imsi',
                'imsi': imsi
            }
        ).done( function( data, status ) {

                var response = $.parseJSON( $( data ).find( 'response_data' ).text() );
                var imsi_data = $.parseJSON( response.imsi_data );

                var evidence = null;

                if( imsi_data && imsi_data.is_EU !== false ) {
                    var network = imsi_data.operator.network;
                    if( network.length == 0 ) {
                        network = imsi_data.operator.brand;
                    }
                    evidence = {
                        'resolved_country_code': imsi_data.country_code,
                        'used': true,
                        'evidence_value': 'MCC:' + imsi_data.mcc + ', MNC:' + imsi_data.operator_code + ', Network:' + network,
                        'evidence-type': 'other_commercially_relevant_info'
                    }
                }

                imsi_evidence = evidence;
                my.updateEvidence();

            } );
    };

    my.updateEvidence = function() {
        var evidence_count = 0;
        var matching_reference = [];
        var matching_key = [];

        if ( my.calculatedLocation && imsi_evidence && my.calculatedLocation.billing_country_code == imsi_evidence.resolved_country_code ) {
            evidence_count = 1;

            $.each( my.calculatedLocation.countries, function( key, item ) {
                if( item && item.cca2 == imsi_evidence.resolved_country_code ) {
                    evidence_count += 1;
                    matching_key.push( key );
                    matching_reference.push( item );
                }
            } );

            if( evidence_count > 1 ) {
                my.calculatedLocation.countries.other_commercially_relevant_info = matching_reference[0];
            } else {
                my.calculatedLocation.countries.other_commercially_relevant_info = null;
            }

            my.calculatedLocation.evidence.other_commercially_relevant_info = imsi_evidence;

            if( evidence_count > 1 ) {
                $.each( matching_key, function( key, item ) {
                    my.calculatedLocation.evidence[item].used = true;
                } );

                if( my.calculatedLocation.countries.other_commercially_relevant_info.tax_supported ) {
                    my.calculatedLocation.tax_country_code = my.calculatedLocation.countries.other_commercially_relevant_info.cca2;
                    my.calculatedLocation.tax_supported = true;
                }
            }

        } else {

            if( my.calculatedLocation.evidence.by_ip.resolved_country_code != my.calculatedLocation.evidence.by_billing.resolved_country_code ) {
                my.calculatedLocation.evidence.other_commercially_relevant_info = null;
                my.calculatedLocation.tax_country_code = null;
                my.calculatedLocation.tax_supported = null;
            }
        }

        // Force country selection overlay to show
        var old = parseInt( my.calculatedLocation.countries.by_ip.tax_supported );
        my.calculatedLocation.countries.by_ip.tax_supported = old == 1 ? true : false;

        my.publishEvent('taxamo.country.detected_post', my.calculatedLocation );

    }

    return my;
})(Taxamo || {});


jQuery( document ).ready( function ( $ ) {


    $('[name="tax-evidence-update"]' ).on( 'click', function(target){

        var imsi = $('[name="tax-evidence-imsi"]' ).val();
        if( imsi.length == 15 ) {
            // Lets validate
            Taxamo.detectIMSI( imsi );
        }

    });


    //if ( typeof Taxamo !== "undefined" && taxamo_token_ok() ) {
    if ( typeof Taxamo !== "undefined" ) {
        Taxamo.subscribe( 'taxamo.prices.updated', function ( data ) {
            integrate_taxamo( data );
        } );
    }

    /**
     * Better change things if the user changes country
     */
    //if ( typeof Taxamo !== "undefined" && taxamo_token_ok() ) {
    if ( typeof Taxamo !== "undefined" ) {
        Taxamo.subscribe( 'taxamo.country.detected', function ( data ) {
            // Use additional Taxamo module
            var imsi = $('[name="tax-evidence-imsi"]' ).val();

            Taxamo.detectIMSI( imsi );
        } );
        // Use the additional module's detection
        Taxamo.subscribe( 'taxamo.country.detected_post', function ( data ) {
            $( '.tax-checkout-warning' ).remove();

            if ( !data.tax_country_code ) {
                $( '[name="tax-country"]' ).val( data.evidence.by_ip.resolved_country_code );
            } else {
                $( '[name="tax-country"]' ).val( data.tax_country_code );
            }

            integrate_taxamo( data );
            taxamo_scan_prices();

            // @todo Check this
            // Incompatible evidence....
            if ( data.billing_country_code != '00' && ( data.evidence.by_ip.resolved_country_code != data.evidence.by_billing.resolved_country_code ) &&
                    (
                        (
                            data.evidence.other_commercially_relevant_info && data.evidence.other_commercially_relevant_info.resolved_country_code != data.evidence.by_billing.resolved_country_code
                        ) || (
                            data.evidence.other_commercially_relevant_info === null
                        )
                    )
            ) {
                $( '.tax-checkout-evidence' ).removeClass( 'hidden' );
            } else {
                $( '.tax-checkout-evidence' ).addClass( 'hidden' );
            }

        } );
    }


    function add_additional_evidence( imsi ) {

    }


    function taxamo_update_evidence() {

        if( ! Taxamo.calculatedLocation ) {
            return false;
        }

        var data = Taxamo.calculatedLocation;
        var evidence_data = {};
        evidence_data.billing_country_code = data.billing_country_code;
        evidence_data.buyer_ip = data.buyer_ip;
        evidence_data.evidence = data.evidence;
        evidence_data.country_name = data.country_name;
        evidence_data.tax_country_code = data.tax_country_code;
        evidence_data.tax_supported = data.tax_supported;
        evidence_data.tax_percentage = $( '.price-plain .tax-rate' ).html();
        $( '[name="tax-evidence"]' ).val( JSON.stringify( evidence_data ) );
        console.log( $( '[name="tax-evidence"]' ).val() );
    }
    function taxamo_token_ok() {
        tokenOK = false;
        Taxamo.verifyToken( function ( data ) {
            tokenOK = data.tokenOK;
        } );
        return tokenOK;
    }

    function taxamo_scan_prices() {
        Taxamo.scanPrices( '.price-plain, .monthly-price-hidden, .savings-price-hidden', {
            "priceTemplate": "<div class=\"tax-total\">${totalAmount}</div><div class=\"tax-amount\">${taxAmount}</div><div class=\"tax-rate\">${taxRate}</div><div class=\"tax-base\">${amount}</div>",
            "noTaxTitle": "", //set titles to false to disable title attribute update
            "taxTitle": ""
        } );
    }

    /**
     * Are we using Taxamo?
     *
     * If its an EU location (tax_supported) return true, else false.
     */
    function is_taxamo() {

        if ( Taxamo.calculatedLocation !== undefined || typeof Taxamo.calculatedLocation !== 'undefined' ) {
            return Taxamo.calculatedLocation.tax_supported
        } else {
            return false;
        }

    }


    function integrate_taxamo( data ) {
        var use_taxamo = is_taxamo();

        if ( use_taxamo ) {

            // Set Taxamo
            if ( $( '[name="tax-type"]' ).val() != 'taxamo' ) {
                $( '[name="tax-type"]' ).attr( 'data-old', $( '[name="tax-type"]' ).val() );
            }
            $( '[name="tax-type"]' ).val( 'taxamo' );

            // Update Primary Display Prices
            $.each( $( '.price-plain.hidden' ), function ( index, value ) {
                var amount = $( value ).find( '.tax-total' ).html();
                var percentage = $( value ).find( '.tax-rate' ).html();

                var run_once = false;

                if ( typeof amount !== 'undefined' ) {
                    amount = amount.split( '.' );

                    if ( !run_once && use_taxamo ) {
                        $( '.tax-checkout-notice .tax-percentage' ).html( percentage );
                        $( '.tax-checkout-notice' ).removeClass( 'hidden' );
                    } else if ( !run_once ) {
                        $( '.tax-checkout-notice' ).addClass( 'hidden' );
                    }

                    if ( 0 < amount[ 0 ] ) {
                        $( $( value ).prev() ).find( '.whole' ).html( amount[ 0 ] );
                    }

                    if ( 0 < amount[ 1 ] ) {
                        $( $( value ).prev() ).find( '.decimal' ).html( amount[ 1 ] );
                        $( $( value ).prev() ).find( '.dot' ).removeClass( 'hidden' );
                        $( $( value ).prev() ).find( '.decimal' ).removeClass( 'hidden' );
                    } else {
                        $( $( value ).prev() ).find( '.decimal' ).html( '' );
                        $( $( value ).prev() ).find( '.dot' ).addClass( 'hidden' );
                        $( $( value ).prev() ).find( '.decimal' ).addClass( 'hidden' );
                    }

                    run_once = true;
                }
            } );

            // Update monthly savings prices
            $.each( $( '.monthly-price-hidden, .savings-price-hidden' ), function ( index, value ) {
                var amount = $( value ).find( '.tax-total' ).html();
                if ( typeof amount !== 'undefined' ) {
                    if ( 0 < amount[ 0 ] ) {
                        var amount_string = $( $( value ).prev() ).html();
                        //var tax_base = $( value ).find( '.tax-base' ).html();
                        var replace_value = $( value ).attr( 'taxamo-amount-str' );
                        amount_string = amount_string.replace( replace_value, amount );
                        if ( 'yes' != $( $( value ).prev() ).attr( 'data-updated' ) ) {
                            $( $( value ).prev() ).html( amount_string );
                        }
                        $( $( value ).prev() ).attr( 'data-updated', 'yes' );
                    }
                }
            } );

        } else {

            // Reset tax type
            if ( typeof ($( '[name="tax-type"]' ).attr( 'data-old' )) !== 'undefined' ) {
                $( '[name="tax-type"]' ).val( $( '[name="tax-type"]' ).attr( 'data-old' ) );
            }

            // Update Primary Display Prices
            $( '.tax-checkout-notice' ).addClass( 'hidden' );
            $.each( $( '.price-plain.hidden' ), function ( index, value ) {
                var amount = $( value ).attr( 'taxamo-amount-str' );
                //console.log( amount );
                if ( typeof amount !== 'undefined' ) {
                    amount = amount.split( '.' );

                    if ( 0 < amount[ 0 ] ) {
                        $( $( value ).prev() ).find( '.whole' ).html( amount[ 0 ] );
                    }

                    if ( 0 < amount[ 1 ] ) {
                        $( $( value ).prev() ).find( '.decimal' ).html( amount[ 1 ] );
                        $( $( value ).prev() ).find( '.dot' ).removeClass( 'hidden' );
                        $( $( value ).prev() ).find( '.decimal' ).removeClass( 'hidden' );
                    } else {
                        $( $( value ).prev() ).find( '.decimal' ).html( '' );
                        $( $( value ).prev() ).find( '.dot' ).addClass( 'hidden' );
                        $( $( value ).prev() ).find( '.decimal' ).addClass( 'hidden' );
                    }
                }
            } );

            // Reset monthly savings prices
            $.each( $( '.monthly-price-hidden, .savings-price-hidden' ), function ( index, value ) {
                var original = $( value ).attr( 'taxamo-original-content' );
                if ( typeof original !== 'undefined' ) {
                    $( $( value ).prev() ).html( original );
                    $( $( value ).prev() ).attr( 'data-updated', '' );
                }
            } );

        }

        taxamo_update_evidence();
    }


    function get_countries_array( dictionary ) {
        var countries = [];
        $.each( dictionary, function ( key, value ) {
            countries.push( value[ 'tax_number_country_code' ] );
        } );
        return countries;
    }

} );