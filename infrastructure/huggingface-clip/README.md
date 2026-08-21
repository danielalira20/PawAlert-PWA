# Endpoint CLIP de PawAlert

El handler expone el embedding visual de 512 dimensiones de
`openai/clip-vit-base-patch32`. Debe agregarse a una copia privada o controlada
del repositorio del modelo y desplegarse como Custom Inference Endpoint.

Contrato HTTP esperado por PawAlert:

```json
{
  "inputs": "<imagen en base64>",
  "content_type": "image/jpeg"
}
```

Respuesta:

```json
{
  "embedding": [0.01, -0.02]
}
```

La lista real contiene exactamente 512 números y ya sale normalizada. Railway
debe configurar `CLIP_ENDPOINT_URL`, `HUGGINGFACE_TOKEN` y, solo después de una
prueba real, `CLIP_VALIDATION_ENABLED=true`.
