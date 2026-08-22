// Firebase Cloud Messaging - 웹 푸시. apiKey 등은 프론트엔드에 그대로 노출되는
// 공개 설정값이라 시크릿이 아니다 (서버 쪽 실제 발송 권한은 백엔드의
// serviceAccountKey.json/FIREBASE_SERVICE_ACCOUNT_B64가 따로 가지고 있음).
import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: "AIzaSyCPuVPbLsrUPDYxnUhdvRtxI3ByrnUU5dw",
  authDomain: "athlepa.firebaseapp.com",
  projectId: "athlepa",
  storageBucket: "athlepa.firebasestorage.app",
  messagingSenderId: "332733557227",
  appId: "1:332733557227:web:0f3be7f3c0fcde3e0111ae",
  measurementId: "G-S3N2N8LHBM",
};

const VAPID_KEY = "BEAJFNOmdDsKwhpi6FTMeOMDJ4gTiXOpd472SUAdR_4K0qFOAH-nEbfSCp4l-ZIbtziCnwgPGzsxJ4a5RHnFGGI";

const app = initializeApp(firebaseConfig);

// 브라우저에 알림 권한을 요청하고, 허용되면 이 브라우저(기기)를 식별하는 FCM
// 등록 토큰을 받아온다. 캠페인 위저드의 웹 푸시 테스트 발송 수신자 칸에 이 토큰을
// 넣으면 실제로 이 브라우저에 알림이 온다.
export async function requestFcmToken() {
  if (!("Notification" in window)) {
    throw new Error("이 브라우저는 알림 기능을 지원하지 않아요.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 거부됐어요. 브라우저 설정에서 알림을 허용해주세요.");
  }
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) {
    throw new Error("토큰을 받아오지 못했어요. 잠시 후 다시 시도해주세요.");
  }
  return token;
}
