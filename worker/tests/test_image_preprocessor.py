import numpy as np

from cafe_ocr_worker.image_preprocessor import pad_with_border_color


def test_pad_with_border_color_uses_edge_median():
    image = np.full((4, 6, 3), [220, 221, 222], dtype=np.uint8)
    image[1:3, 2:4] = [10, 11, 12]

    padded = pad_with_border_color(image, 0.5, 0.25)

    assert padded.shape == (6, 12, 3)
    assert padded[0, 0].tolist() == [220, 221, 222]
    assert padded[1:5, 3:9].tolist() == image.tolist()
