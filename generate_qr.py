#!/usr/bin/env python3
"""Генерация QR-кода со ссылкой на сайт https://ns-zakona.ru

Использование:
    python generate_qr.py                  # сохранит qr_ns_zakona.png
    python generate_qr.py my_qr.png        # своё имя файла

Зависимости:
    pip install qrcode[pil]
"""

import sys

import qrcode

URL = "https://ns-zakona.ru"


def generate(output: str = "qr_ns_zakona.png") -> None:
    qr = qrcode.QRCode(
        version=None,  # авто-подбор размера
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(URL)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output)
    print(f"QR-код сохранён: {output}  ->  {URL}")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "qr_ns_zakona.png"
    generate(output)
