-- Review proposal only. Destructive rollback requires a separate exact gate.
-- Keep the catalog-only installation marker: residual consent purpose records
-- must not be silently treated as an uninstalled pilot by privacy workflows.
BEGIN;
UPDATE system.feature_flags SET enabled = false WHERE flag_key = 'analytics.account_daily_activity_pilot';
DROP FUNCTION privacy.expire_activity_measurement(integer);
DROP FUNCTION privacy.purge_activity_measurement(uuid,uuid);
DROP FUNCTION privacy.export_activity_measurement(uuid,uuid);
DROP FUNCTION privacy.activity_measurement_aggregate();
DROP FUNCTION privacy.record_activity_measurement_day(bigint,uuid);
DROP FUNCTION privacy.set_activity_measurement_consent(uuid,boolean,bigint,uuid,text);
DROP FUNCTION privacy.activity_measurement_status();
DROP FUNCTION privacy.activity_measurement_enabled();
DROP FUNCTION privacy.activity_measurement_subject();
DROP FUNCTION privacy.activity_measurement_lock_holds(uuid);
DROP FUNCTION privacy.reconcile_activity_measurement_locations(uuid);
DROP TABLE privacy.account_active_days;
ALTER TABLE identity.consent_records DROP CONSTRAINT activity_consent_account_identity;
DROP TABLE privacy.activity_measurement_consents;
DROP TABLE privacy.activity_measurement_coverage;
DROP TABLE privacy.activity_measurement_configuration;
COMMIT;
