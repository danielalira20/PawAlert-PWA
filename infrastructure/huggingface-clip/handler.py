"""Handler para desplegar junto a openai/clip-vit-base-patch32 en HF."""

import base64
from io import BytesIO
from typing import Any

import torch
from PIL import Image, ImageOps
from transformers import AutoProcessor, CLIPModel


class EndpointHandler:
    def __init__(self, path: str = ""):
        self.processor = AutoProcessor.from_pretrained(path)
        self.model = CLIPModel.from_pretrained(path)
        self.model.eval()

    def __call__(self, data: dict[str, Any]) -> dict[str, list[float]]:
        encoded = data.get("inputs")
        if not isinstance(encoded, str) or not encoded:
            raise ValueError("inputs must contain a base64 image")

        image_bytes = base64.b64decode(encoded, validate=True)
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")

        inputs = self.processor(images=image, return_tensors="pt")
        with torch.inference_mode():
            features = self.model.get_image_features(**inputs)
            normalized = features / features.norm(p=2, dim=-1, keepdim=True)

        return {"embedding": normalized[0].cpu().tolist()}
