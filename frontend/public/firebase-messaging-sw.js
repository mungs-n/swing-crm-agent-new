// FCM은 탭이 백그라운드/닫힌 상태에서도 알림을 받으려면 이 서비스 워커가 필요하다.
// 반드시 사이트 루트(public/)에 있어야 전체 오리진 범위로 등록된다.
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCPuVPbLsrUPDYxnUhdvRtxI3ByrnUU5dw",
  authDomain: "athlepa.firebaseapp.com",
  projectId: "athlepa",
  storageBucket: "athlepa.firebasestorage.app",
  messagingSenderId: "332733557227",
  appId: "1:332733557227:web:0f3be7f3c0fcde3e0111ae",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, image } = payload.notification || {};
  self.registration.showNotification(title || "ATHLEPA 알림", { body, icon: image });
});
