// 크롬 등 브라우저는 웹 푸시의 큰 이미지를 가로로 넓은 배너 비율(약 2:1)로 강제
// 크롭해서 보여준다. 원본을 그대로 올리면 브라우저가 어디를 자를지 우리가 통제할
// 수 없으니, 업로드 전에 미리 같은 비율로 가운데를 기준 잘라서 보낸다.
const WEBPUSH_IMAGE_RATIO = 2;

export function cropToWebpushRatio(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (srcRatio > WEBPUSH_IMAGE_RATIO) {
        sh = img.height;
        sw = sh * WEBPUSH_IMAGE_RATIO;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = sw / WEBPUSH_IMAGE_RATIO;
        sx = 0;
        sy = (img.height - sh) / 2;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000 / WEBPUSH_IMAGE_RATIO;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
