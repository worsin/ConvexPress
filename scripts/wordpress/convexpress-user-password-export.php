<?php
/**
 * Plugin Name: ConvexPress User Password Export
 * Description: Temporary migration-only endpoint for exporting wp_users.user_pass digests to ConvexPress.
 * Version: 1.0.0
 * Author: ConvexPress
 *
 * Install only for a supervised migration, then remove it immediately after
 * Clerk credential provisioning is complete.
 */

if (!defined('ABSPATH')) {
    exit;
}

const CONVEXPRESS_PASSWORD_EXPORT_HEADER = 'x-convexpress-migration-secret';
const CONVEXPRESS_PASSWORD_EXPORT_ENV = 'CONVEXPRESS_USER_PASSWORD_EXPORT_SECRET';
const CONVEXPRESS_PASSWORD_EXPORT_ROUTE = '/user-password-digests';

add_action('rest_api_init', function () {
    register_rest_route('convexpress/v1', CONVEXPRESS_PASSWORD_EXPORT_ROUTE, array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'convexpress_user_password_export_handle',
        'permission_callback' => 'convexpress_user_password_export_can_read',
        'args' => array(
            'include' => array(
                'description' => 'Comma-separated WordPress user IDs to include.',
                'type' => 'string',
                'required' => false,
            ),
        ),
    ));
});

function convexpress_user_password_export_secret() {
    if (defined(CONVEXPRESS_PASSWORD_EXPORT_ENV) && constant(CONVEXPRESS_PASSWORD_EXPORT_ENV)) {
        return (string) constant(CONVEXPRESS_PASSWORD_EXPORT_ENV);
    }

    $env_value = getenv(CONVEXPRESS_PASSWORD_EXPORT_ENV);
    return is_string($env_value) ? $env_value : '';
}

function convexpress_user_password_export_can_read(WP_REST_Request $request) {
    $expected = convexpress_user_password_export_secret();
    $provided = $request->get_header(CONVEXPRESS_PASSWORD_EXPORT_HEADER);

    if ($expected === '') {
        return new WP_Error(
            'convexpress_export_secret_missing',
            'ConvexPress password export secret is not configured.',
            array('status' => 503)
        );
    }

    if (!is_user_logged_in() || !current_user_can('list_users')) {
        return new WP_Error(
            'convexpress_export_forbidden',
            'A WordPress user with user-listing capability is required.',
            array('status' => 403)
        );
    }

    if (!is_string($provided) || !hash_equals($expected, trim($provided))) {
        return new WP_Error(
            'convexpress_export_secret_invalid',
            'Invalid ConvexPress password export secret.',
            array('status' => 403)
        );
    }

    return true;
}

function convexpress_user_password_export_include_ids(WP_REST_Request $request) {
    $include = $request->get_param('include');
    if (!is_string($include) || trim($include) === '') {
        return array();
    }

    $ids = array();
    foreach (explode(',', $include) as $raw_id) {
        $id = absint(trim($raw_id));
        if ($id > 0) {
            $ids[] = $id;
        }
    }

    return array_values(array_unique($ids));
}

function convexpress_user_password_export_handle(WP_REST_Request $request) {
    global $wpdb;

    $include_ids = convexpress_user_password_export_include_ids($request);

    if (!empty($include_ids)) {
        $placeholders = implode(',', array_fill(0, count($include_ids), '%d'));
        $query = $wpdb->prepare(
            "SELECT ID, user_login, user_email, user_registered, user_pass FROM {$wpdb->users} WHERE ID IN ($placeholders) ORDER BY ID ASC",
            $include_ids
        );
    } else {
        $query = "SELECT ID, user_login, user_email, user_registered, user_pass FROM {$wpdb->users} ORDER BY ID ASC";
    }

    $rows = $wpdb->get_results($query, ARRAY_A);
    if (!is_array($rows)) {
        return rest_ensure_response(array());
    }

    $payload = array_map(function ($row) {
        return array(
            'id' => (int) $row['ID'],
            'user_login' => (string) $row['user_login'],
            'user_email' => (string) $row['user_email'],
            'user_registered' => (string) $row['user_registered'],
            'user_pass' => (string) $row['user_pass'],
        );
    }, $rows);

    return rest_ensure_response($payload);
}
