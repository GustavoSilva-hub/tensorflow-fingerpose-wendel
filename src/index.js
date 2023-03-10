import { gestures } from "./gestures.js";

const config = {
  video: { width: 640, height: 480, fps: 30 },
};

const landmarkColors = {
  thumb: "red",
  index: "blue",
  middle: "yellow",
  ring: "green",
  pinky: "pink",
  wrist: "white",
};

const gestureStrings = {
  thumbs_up: "👍",
  victory: "✌🏻",
  rock: "✊️",
  paper: "🖐",
  scissors: "✌️",
  hangloose: " 🤙",
  dont: "🙅",
};

const base = ["Horizontal", "Diagonal Up"];
const dont = {
  left: [...base].map((i) => i.concat(`Right`).replaceAll(" ", "")),
  right: [...base].map((i) => i.concat(`Left`).replaceAll(" ", "")),
};

async function createDetector() {
  return window.handPoseDetection.createDetector(
    window.handPoseDetection.SupportedModels.MediaPipeHands,
    {
      runtime: "mediapipe",
      modelType: "full",
      maxHands: 2,
      solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915`,
    }
  );
}

async function main() {
  const video = document.querySelector("#pose-video");
  const canvas = document.querySelector("#pose-canvas");
  const ctx = canvas.getContext("2d");

  const resultLayer = {
    right: document.querySelector("#pose-result-right"),
    left: document.querySelector("#pose-result-left"),
  };
  // configure gesture estimator
  // add "✌🏻" and "👍" as sample gestures
  const knownGestures = [
    fp.Gestures.VictoryGesture,
    fp.Gestures.ThumbsUpGesture,
    ...gestures,
  ];
  const GE = new fp.GestureEstimator(knownGestures);
  // load handpose model
  const detector = await createDetector();
  console.log("mediaPose model loaded");

  const pair = new Set();

  function checkGestureCombination(chosenHand, poseData) {
    const fingerDirectionIndex = 2;

    const addToPairIfCorrect = (chosenHand) => {
      const containsHand = poseData.some((finger) =>
        dont[chosenHand].includes(
          finger[fingerDirectionIndex].replaceAll(" ", "")
        )
      );

      if (!containsHand) return;
      pair.add(chosenHand);
    };

    addToPairIfCorrect(chosenHand);
    if (pair.size !== 2) return;
    resultLayer.left.innerText = resultLayer.right.innerText =
      gestureStrings.dont;

    pair.clear();
    /*Same value to bouth*/
  }

  // main estimation loop
  const estimateHands = async () => {
    // clear canvas overlay
    ctx.clearRect(0, 0, config.video.width, config.video.height);
    resultLayer.right.innerText = "";
    resultLayer.left.innerText = "";

    // get hand landmarks from video
    const hands = await detector.estimateHands(video, {
      flipHorizontal: true,
    });
    //hands -> object with the finger coordinates
    // const keyPoints3D =
    for (const hand of hands) {
      for (const keypoint of hand.keypoints) {
        const name = keypoint.name.split("_")[0].toString().toLowerCase();
        const color = landmarkColors[name];
        drawPoint(ctx, keypoint.x, keypoint.y, 3, color);
      }

      const keypoints3D = hand.keypoints3D.map((keypoint) => [
        keypoint.x,
        keypoint.y,
        keypoint.z,
      ]);
      const trustLevel = 9;
      const predictions = GE.estimate(keypoints3D, trustLevel);

      if (!predictions.gestures.length) {
        updateDebugInfo(predictions.poseData, "left");
      }

      if (predictions.gestures.length > 0) {
        // find gesture with highest match score
        const result = predictions.gestures.reduce((p, c) => {
          return p.score > c.score ? p : c;
        });
        const chosenHand = hand.handedness.toLowerCase();
        updateDebugInfo(predictions.poseData, chosenHand);
        const gestureFound = gestureStrings[result.name];

        // if(gestureFound !== gestureStrings.dont){
        //   resultLayer[chosenHand].innerText = gestureFound;
        //   continue;
        // }

        const wristKeyPoint3D = hand.keypoints3D.filter(
          (keypoint) => (keypoint.name = "wrist")
        )[0];
        lookingForDragMovement(wristKeyPoint3D, gestureFound);
        checkGestureCombination(chosenHand, predictions.poseData);
      }
    }
    // ...and so on
    setTimeout(() => {
      estimateHands();
    }, 1000 / config.video.fps);
  };
  console.log("Starting predictions");
  estimateHands();
}

async function initCamera(width, height, fps) {
  const constraints = {
    audio: false,
    video: {
      facingMode: "user",
      width: width,
      height: height,
      frameRate: { max: fps },
    },
  };

  const video = document.querySelector("#pose-video");
  video.width = width;
  video.height = height;

  // get video stream
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

function drawPoint(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function updateDebugInfo(data, hand) {
  const summaryTable = `#summary-${hand}`;
  for (let fingerIdx in data) {
    document.querySelector(`${summaryTable} span#curl-${fingerIdx}`).innerHTML =
      data[fingerIdx][1];
    document.querySelector(`${summaryTable} span#dir-${fingerIdx}`).innerHTML =
      data[fingerIdx][2];
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initCamera(config.video.width, config.video.height, config.video.fps).then(
    (video) => {
      video.play();
      video.addEventListener("loadeddata", (event) => {
        console.log("Camera is ready");
        main();
      });
    }
  );

  const canvas = document.querySelector("#pose-canvas");
  canvas.width = config.video.width;
  canvas.height = config.video.height;
  console.log("Canvas initialized");
});

let gesturesLocations = [];
function lookingForDragMovement(wristKeyPoints3D, gesture) {
  const lastGestureLocation =
    gesturesLocations.length > 0
      ? gesturesLocations[gesturesLocations.length - 1]
      : undefined;

  gesturesLocations = [];

  const newGestureLocation = {
    gesture,
    y: Number.parseInt(wristKeyPoints3D.y * 1000000),
    x: Number.parseInt(wristKeyPoints3D.x * 1000000),
  };

  if (lastGestureLocation && (newGestureLocation.gesture == lastGestureLocation.gesture)) {
    const differenceBetweenYLocations =
      lastGestureLocation.y - newGestureLocation.y;

    const necessaryDifference = 1200;

    if ((differenceBetweenYLocations * -1) / (necessaryDifference * -1)> (1.2* -1 )) {
      console.log("last: ", lastGestureLocation.y, "new", newGestureLocation.y);
      console.log(differenceBetweenYLocations);

      if (differenceBetweenYLocations > necessaryDifference) {
        moveVideo(-20);
      } else if (differenceBetweenYLocations < -necessaryDifference) {
        moveVideo(20);
      }
    }

  }

  if(newGestureLocation.gesture == gestureStrings.paper) gesturesLocations.push(newGestureLocation);
}

function moveVideo(additionalPosition){
  console.log('addPosition: ', additionalPosition);


  const video = document.getElementById("video-container");
  const newTopPosition =  video.offsetTop + additionalPosition;
  console.log('newTopPosition: ', newTopPosition);
  video.style.top = newTopPosition+"px";

}