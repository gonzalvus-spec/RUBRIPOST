//! Fechas en documentos de MongoDB.
//!
//! La app guarda las fechas como `BSON DateTime`, pero algunos documentos
//! antiguos las tienen como texto RFC 3339. Estos helpers permiten leer ambos
//! formatos y escribir siempre como fecha nativa de MongoDB.

use chrono::{DateTime, Utc};
use serde::{de::Error as _, Deserialize, Deserializer, Serializer};

/// Serializa/deserializa una fecha que puede venir como BSON Date o como texto
/// RFC 3339.
pub mod fecha_bson_o_texto {
    use super::*;

    pub fn serialize<S>(value: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        bson::serde_helpers::chrono_datetime_as_bson_datetime::serialize(value, serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        match bson::Bson::deserialize(deserializer)? {
            bson::Bson::DateTime(value) => Ok(value.to_chrono()),
            bson::Bson::String(value) => DateTime::parse_from_rfc3339(&value)
                .map(|date| date.with_timezone(&Utc))
                .map_err(D::Error::custom),
            other => Err(D::Error::custom(format!(
                "fecha inválida en MongoDB: {other:?}"
            ))),
        }
    }
}

/// Igual que `fecha_bson_o_texto`, pero admite `null`.
pub mod fecha_opcional_bson_o_texto {
    use super::*;

    pub fn serialize<S>(
        value: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        bson::serde_helpers::chrono_datetime_as_bson_datetime_optional::serialize(
            value, serializer,
        )
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        match bson::Bson::deserialize(deserializer)? {
            bson::Bson::Null => Ok(None),
            bson::Bson::DateTime(value) => Ok(Some(value.to_chrono())),
            bson::Bson::String(value) => DateTime::parse_from_rfc3339(&value)
                .map(|date| Some(date.with_timezone(&Utc)))
                .map_err(D::Error::custom),
            other => Err(D::Error::custom(format!(
                "fecha inválida en MongoDB: {other:?}"
            ))),
        }
    }
}
