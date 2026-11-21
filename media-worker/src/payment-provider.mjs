export async function paymentProviderSettings(db){return db.prepare('SELECT * FROM payment_provider_settings WHERE id=1').first()}
export async function selectedPaymentProvider(db){return (await paymentProviderSettings(db))?.active_provider||'tribute'}
