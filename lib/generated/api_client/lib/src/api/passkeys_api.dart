//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

import 'dart:async';

import 'package:built_value/serializer.dart';
import 'package:dio/dio.dart';

import 'package:built_value/json_object.dart';
import 'package:lythaus_api_client/src/api_util.dart';
import 'package:lythaus_api_client/src/model/passkey_capability.dart';
import 'package:lythaus_api_client/src/model/passkey_ceremony_request.dart';
import 'package:lythaus_api_client/src/model/passkey_challenge.dart';
import 'package:lythaus_api_client/src/model/passkey_credential_list.dart';
import 'package:lythaus_api_client/src/model/passkey_enrollment.dart';
import 'package:lythaus_api_client/src/model/passkey_error.dart';
import 'package:lythaus_api_client/src/model/passkey_maintenance.dart';
import 'package:lythaus_api_client/src/model/passkey_register_options_request.dart';
import 'package:lythaus_api_client/src/model/passkey_rename_request.dart';
import 'package:lythaus_api_client/src/model/passkey_rename_result.dart';
import 'package:lythaus_api_client/src/model/passkey_revoke_request.dart';
import 'package:lythaus_api_client/src/model/passkey_revoke_result.dart';
import 'package:lythaus_api_client/src/model/passkey_session.dart';

class PasskeysApi {

  final Dio _dio;

  final Serializers _serializers;

  const PasskeysApi(this._dio, this._serializers);

  /// List your active passkeys
  /// Owner-only names, backup state and timestamps. Public keys, authenticator credential IDs and user handles are omitted.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyCredentialList] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyCredentialList>> listPasskeys({
    required String origin,
    required String xLythausAuthTransport,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/credentials';
    final _options = Options(
      method: r'GET',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      validateStatus: validateStatus,
    );

    final _response = await _dio.request<Object>(
      _path,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyCredentialList? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyCredentialList),
      ) as PasskeyCredentialList;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyCredentialList>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Check optional passkey availability
  /// Disabled by default. Returns enabled:false without schema access when the feature flag is off. Browser support is checked locally.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyCapability] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyCapability>> passkeyCapabilities({
    required String origin,
    required String xLythausAuthTransport,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/capabilities';
    final _options = Options(
      method: r'GET',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[],
        ...?extra,
      },
      validateStatus: validateStatus,
    );

    final _response = await _dio.request<Object>(
      _path,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyCapability? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyCapability),
      ) as PasskeyCapability;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyCapability>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Start passkey login
  /// Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite&#x3D;Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [body]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyChallenge] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyChallenge>> passkeyLoginOptions({
    required String origin,
    required String xLythausAuthTransport,
    required JsonObject body,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/login/options';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      _bodyData = body;

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyChallenge? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyChallenge),
      ) as PasskeyChallenge;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyChallenge>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Verify passkey login
  /// Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyCeremonyRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeySession] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeySession>> passkeyLoginVerify({
    required String origin,
    required String xLythausAuthTransport,
    required PasskeyCeremonyRequest passkeyCeremonyRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/login/verify';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyCeremonyRequest);
      _bodyData = _serializers.serialize(passkeyCeremonyRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeySession? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeySession),
      ) as PasskeySession;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeySession>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Start passkey maintenance
  /// Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite&#x3D;Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [body]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyChallenge] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyChallenge>> passkeyMaintenanceOptions({
    required String origin,
    required String xLythausAuthTransport,
    required JsonObject body,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/maintenance/options';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      _bodyData = body;

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyChallenge? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyChallenge),
      ) as PasskeyChallenge;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyChallenge>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Verify passkey maintenance
  /// Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyCeremonyRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyMaintenance] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyMaintenance>> passkeyMaintenanceVerify({
    required String origin,
    required String xLythausAuthTransport,
    required PasskeyCeremonyRequest passkeyCeremonyRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/maintenance/verify';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyCeremonyRequest);
      _bodyData = _serializers.serialize(passkeyCeremonyRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyMaintenance? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyMaintenance),
      ) as PasskeyMaintenance;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyMaintenance>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Start passkey register
  /// Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite&#x3D;Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyRegisterOptionsRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyChallenge] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyChallenge>> passkeyRegisterOptions({
    required String origin,
    required String xLythausAuthTransport,
    required PasskeyRegisterOptionsRequest passkeyRegisterOptionsRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/register/options';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyRegisterOptionsRequest);
      _bodyData = _serializers.serialize(passkeyRegisterOptionsRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyChallenge? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyChallenge),
      ) as PasskeyChallenge;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyChallenge>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Verify passkey register
  /// Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyCeremonyRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyEnrollment] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyEnrollment>> passkeyRegisterVerify({
    required String origin,
    required String xLythausAuthTransport,
    required PasskeyCeremonyRequest passkeyCeremonyRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/register/verify';
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyCeremonyRequest);
      _bodyData = _serializers.serialize(passkeyCeremonyRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyEnrollment? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyEnrollment),
      ) as PasskeyEnrollment;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyEnrollment>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Rename your passkey
  /// Requires a current active owner session.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyId]
  /// * [passkeyRenameRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyRenameResult] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyRenameResult>> renamePasskey({
    required String origin,
    required String xLythausAuthTransport,
    required String passkeyId,
    required PasskeyRenameRequest passkeyRenameRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/credentials/{passkeyId}'.replaceAll('{' r'passkeyId' '}', encodeQueryParameter(_serializers, passkeyId, const FullType(String)).toString());
    final _options = Options(
      method: r'PATCH',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyRenameRequest);
      _bodyData = _serializers.serialize(passkeyRenameRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyRenameResult? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyRenameResult),
      ) as PasskeyRenameResult;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyRenameResult>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// Remove your passkey
  /// Requires the current account password and owner session. Revokes all auth sessions and refresh families, and increments token_version. Email/password and recovery remain available.
  ///
  /// Parameters:
  /// * [origin] - Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
  /// * [xLythausAuthTransport]
  /// * [passkeyId]
  /// * [passkeyRevokeRequest]
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [PasskeyRevokeResult] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<PasskeyRevokeResult>> revokePasskey({
    required String origin,
    required String xLythausAuthTransport,
    required String passkeyId,
    required PasskeyRevokeRequest passkeyRevokeRequest,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/auth/passkeys/credentials/{passkeyId}/revoke'.replaceAll('{' r'passkeyId' '}', encodeQueryParameter(_serializers, passkeyId, const FullType(String)).toString());
    final _options = Options(
      method: r'POST',
      headers: <String, dynamic>{
        r'Origin': origin,
        r'X-Lythaus-Auth-Transport': xLythausAuthTransport,
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      contentType: 'application/json',
      validateStatus: validateStatus,
    );

    dynamic _bodyData;

    try {
      const _type = FullType(PasskeyRevokeRequest);
      _bodyData = _serializers.serialize(passkeyRevokeRequest, specifiedType: _type);

    } catch(error, stackTrace) {
      throw DioException(
         requestOptions: _options.compose(
          _dio.options,
          _path,
        ),
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    final _response = await _dio.request<Object>(
      _path,
      data: _bodyData,
      options: _options,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    PasskeyRevokeResult? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(PasskeyRevokeResult),
      ) as PasskeyRevokeResult;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<PasskeyRevokeResult>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

}
