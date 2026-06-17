/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { TMModelType, ModelClassMapping } from "../types";
import { Camera, Mic, Sliders, Link, Cpu, Play, CheckCircle, AlertCircle, RefreshCw, Sparkles } from "lucide-react";

declare global {
  interface Window {
    tf: any;
    tmImage: any;
    tmPose: any;
    speechCommands: any;
    tmSpeech: any;
  }
}

interface TeachableMachinePanelProps {
  onAction: (action: "JUMP" | "CROUCH" | "RELEASE") => void;
  onActiveStateChange: (isActive: boolean) => void;
}

export function TeachableMachinePanel({ onAction, onActiveStateChange }: TeachableMachinePanelProps) {
  const [modelType, setModelType] = useState<TMModelType>("IMAGE");
  const [modelUrl, setModelUrl] = useState<string>("");
  const [loadingStatus, setLoadingStatus] = useState<"IDLE" | "LOADING_SCRIPTS" | "LOADING_MODEL" | "STARTING_STREAMS" | "READY" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.80);
  const [classMappings, setClassMappings] = useState<ModelClassMapping[]>([]);
  const [predictions, setPredictions] = useState<{ className: string; probability: number }[]>([]);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [useSimulation, setUseSimulation] = useState<boolean>(false);
  const [simulatedClasses, setSimulatedClasses] = useState<string[]>(["Neutral / Still", "Raise Hands", "Crouch Move"]);
  const [simulatedProbabilities, setSimulatedProbabilities] = useState<{ [key: string]: number }>({
    "Neutral / Still": 0.90,
    "Raise Hands": 0.05,
    "Crouch Move": 0.05,
  });

  const webcamContainerRef = useRef<HTMLDivElement | null>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webcamRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const predictLoopIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataIdRef = useRef<number | null>(null);

  // Script load tracking
  const [scriptsLoaded, setScriptsLoaded] = useState<{ tfjs: boolean; image: boolean; pose: boolean; speech: boolean }>({
    tfjs: false,
    image: false,
    pose: false,
    speech: false,
  });

  // Dynamic script loader from CDN
  const loadCDNAsset = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const alreadyIncluded = document.querySelector(`script[src="${url}"]`);
      if (alreadyIncluded) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (err) => reject(new Error(`Failed to load dependency CDN script: ${url}`));
      document.head.appendChild(script);
    });
  };

  // Synchronous loader for selected models
  const prepareModelScripts = async (type: TMModelType) => {
    setLoadingStatus("LOADING_SCRIPTS");
    try {
      // tfjs is base
      await loadCDNAsset("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0/dist/tf.min.js");
      setScriptsLoaded((prev) => ({ ...prev, tfjs: true }));

      if (type === "IMAGE") {
        await loadCDNAsset("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js");
        setScriptsLoaded((prev) => ({ ...prev, image: true }));
      } else if (type === "POSE") {
        // Pose requires supplementary Posenet assets
        await loadCDNAsset("https://cdn.jsdelivr.net/npm/@tensorflow-models/posenet@2.2.2/dist/posenet.min.js");
        await loadCDNAsset("https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8.6/dist/teachablemachine-pose.min.js");
        setScriptsLoaded((prev) => ({ ...prev, pose: true }));
      } else if (type === "AUDIO") {
        await loadCDNAsset("https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js");
        // speech loader
        await loadCDNAsset("https://cdn.jsdelivr.net/npm/@teachablemachine/speech@0.8.6/dist/teachablemachine-speech.min.js");
        setScriptsLoaded((prev) => ({ ...prev, speech: true }));
      }
    } catch (err: any) {
      console.error(err);
      throw new Error(`Scripts loading failed. Please verify your connection status. Detail: ${err.message}`);
    }
  };

  // Setup simulation default mode on startup
  useEffect(() => {
    if (useSimulation) {
      const mappings: ModelClassMapping[] = simulatedClasses.map((cl, i) => {
        let action: "NONE" | "JUMP" | "CROUCH" = "NONE";
        if (i === 1) action = "JUMP";
        if (i === 2) action = "CROUCH";
        return { className: cl, action };
      });
      setClassMappings(mappings);
      onActiveStateChange(true);
    } else {
      if (loadingStatus !== "READY") {
        onActiveStateChange(false);
      }
    }
  }, [useSimulation, simulatedClasses]);

  // Web camera / audio stream cleaner
  const stopAllStreams = () => {
    if (predictLoopIdRef.current) {
      cancelAnimationFrame(predictLoopIdRef.current);
      predictLoopIdRef.current = null;
    }
    if (webcamRef.current) {
      try {
        webcamRef.current.stop();
      } catch (e) {
        // ignore webcam-specific teardowns
      }
      webcamRef.current = null;
    }
    if (modelRef.current && modelType === "AUDIO") {
      try {
        modelRef.current.stopListening();
      } catch (e) {}
    }
    if (webcamContainerRef.current) {
      webcamContainerRef.current.innerHTML = "";
    }
    if (audioDataIdRef.current) {
      cancelAnimationFrame(audioDataIdRef.current);
      audioDataIdRef.current = null;
    }
    setWebcamActive(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllStreams();
    };
  }, []);

  // Format TM URL to contain trailing slash as SDK expects checkpoint files
  const cleanTMUrl = (url: string) => {
    let clean = url.trim();
    if (!clean) return "";
    if (!clean.endsWith("/")) {
      clean += "/";
    }
    return clean;
  };

  const handleLoadModel = async () => {
    if (!modelUrl && !useSimulation) {
      setErrorMessage("Please enter a valid Teachable Machine Model URL");
      setLoadingStatus("ERROR");
      return;
    }

    setErrorMessage("");
    stopAllStreams();

    try {
      // 1. Fetch assets
      await prepareModelScripts(modelType);

      // 2. Initialize Model loading
      setLoadingStatus("LOADING_MODEL");
      const formattedUrl = cleanTMUrl(modelUrl);
      const checkpointJson = formattedUrl + "model.json";
      const metadataJson = formattedUrl + "metadata.json";

      if (modelType === "IMAGE") {
        if (!window.tmImage) throw new Error("Teachable Machine Image library is missing in environment");
        modelRef.current = await window.tmImage.load(checkpointJson, metadataJson);
      } else if (modelType === "POSE") {
        if (!window.tmPose) throw new Error("Teachable Machine Pose library is missing in environment");
        modelRef.current = await window.tmPose.load(checkpointJson, metadataJson);
      } else if (modelType === "AUDIO") {
        if (!window.tmSpeech) throw new Error("Teachable Machine Audio/Speech library is missing in environment");
        modelRef.current = window.tmSpeech.create(
          "tfjs",
          undefined,
          checkpointJson,
          metadataJson
        );
        await modelRef.current.ensureModelLoaded();
      }

      // Initialize base class mappings from loaded model attributes
      const labels = modelRef.current.getClassLabels ? modelRef.current.getClassLabels() : modelRef.current.labels;
      
      const defaultMappings: ModelClassMapping[] = labels.map((label: string, index: number) => {
        // Try mapping heuristic: if names include jump or duck
        let action: "NONE" | "JUMP" | "CROUCH" = "NONE";
        const lLower = label.toLowerCase();
        if (lLower.includes("jump") || lLower.includes("up") || lLower.includes("high")) {
          action = "JUMP";
        } else if (lLower.includes("crouch") || lLower.includes("duck") || lLower.includes("down")) {
          action = "CROUCH";
        } else if (index === 1 && labels.length === 3) {
          action = "JUMP";
        } else if (index === 2 && labels.length === 3) {
          action = "CROUCH";
        }
        return { className: label, action };
      });

      setClassMappings(defaultMappings);

      // 3. Setup input feeds (webcam or mic)
      setLoadingStatus("STARTING_STREAMS");
      onActiveStateChange(true);

      if (modelType === "IMAGE" || modelType === "POSE") {
        const width = 200;
        const height = 150;
        const flip = true;

        const WebcamConstructor = modelType === "IMAGE" ? window.tmImage.Webcam : window.tmPose.Webcam;
        const webcamInstance = new WebcamConstructor(width, height, flip);
        
        // Request webcam permissions and start feed
        await webcamInstance.setup();
        await webcamInstance.play();
        webcamRef.current = webcamInstance;

        // Append canvas to container
        if (webcamContainerRef.current) {
          webcamContainerRef.current.innerHTML = "";
          webcamContainerRef.current.appendChild(webcamInstance.canvas);
        }
        setWebcamActive(true);

        // Run recursive predict loop
        startPredictionLoop();
      } else if (modelType === "AUDIO") {
        // Audio listens using speech model
        soundFreqVisualizer(); // activate frequency analyzer visualizer line
        await modelRef.current.listen(
          (result: any) => {
            const scores: { className: string; probability: number }[] = [];
            const labelsList = modelRef.current.getClassLabels();
            
            for (let i = 0; i < labelsList.length; i++) {
              scores.push({
                className: labelsList[i],
                probability: result.scores[i],
              });
            }
            setPredictions(scores);
            evaluateActionRules(scores);
          },
          {
            includeSpectrogram: true,
            probabilityThreshold: 0.70,
            overlapFactor: 0.5,
            invokeCallbackOnNoiseAndUnknown: true,
          }
        );
      }

      setLoadingStatus("READY");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message || "Failed to load model. Please verify the URL is of type Teachable Machine with CORS files available"
      );
      setLoadingStatus("ERROR");
      onActiveStateChange(false);
      setUseSimulation(true); // fall back to simulation
    }
  };

  // Sound visualization wave during MIC listening
  const soundFreqVisualizer = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const actx = new AudioCtxClass();
      audioContextRef.current = actx;

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const src = actx.createMediaStreamSource(stream);
        const anal = actx.createAnalyser();
        anal.fftSize = 64;
        src.connect(anal);
        analyserRef.current = anal;

        const bufferLength = anal.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = audioCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const draw = () => {
          if (!analyserRef.current) return;
          audioDataIdRef.current = requestAnimationFrame(draw);
          analyserRef.current.getByteFrequencyData(dataArray);

          ctx.fillStyle = "#0c0c0c"; // match black slate design bg
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / bufferLength) * 1.5;
          let barHeight;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            // Draw stunning vertical red-to-white bars for Artistic style
            ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#ffffff";
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
          }
        };

        draw();
      });
    } catch (e) {
      // Ignored
    }
  };

  const startPredictionLoop = () => {
    const loop = async () => {
      if (!webcamRef.current || !modelRef.current) return;
      
      try {
        // Feed frame to update prediction
        webcamRef.current.update();
        let predictionResult = [];

        if (modelType === "IMAGE") {
          predictionResult = await modelRef.current.predict(webcamRef.current.canvas);
        } else if (modelType === "POSE") {
          const { pose, posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
          predictionResult = await modelRef.current.predict(posenetOutput);
          // Drawing coordinates placeholder on top of pose model
          if (modelRef.current.drawPose && pose) {
            // Draw skeletal keypoints if available from pose SDK
            const ctx = webcamRef.current.canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, webcamRef.current.canvas.width, webcamRef.current.canvas.height);
              ctx.drawImage(webcamRef.current.canvas, 0, 0); // draw raw canvas stream background
              modelRef.current.drawPose(pose, ctx);
            }
          }
        }

        setPredictions(predictionResult);
        evaluateActionRules(predictionResult);

      } catch (err) {
        console.error("Predict frame failed.", err);
      }

      predictLoopIdRef.current = requestAnimationFrame(loop);
    };

    predictLoopIdRef.current = requestAnimationFrame(loop);
  };

  // Rule evaluator: Matches output class probability against mappings
  const evaluateActionRules = (predsList: { className: string; probability: number }[]) => {
    let metJump = false;
    let metCrouch = false;

    predsList.forEach((pred) => {
      const mapping = classMappings.find((m) => m.className === pred.className);
      if (mapping && pred.probability >= confidenceThreshold) {
        if (mapping.action === "JUMP") {
          metJump = true;
        } else if (mapping.action === "CROUCH") {
          metCrouch = true;
        }
      }
    });

    if (metJump) {
      onAction("JUMP");
    } else if (metCrouch) {
      onAction("CROUCH");
    } else {
      // release crouch state back to idling/normal state
      onAction("RELEASE");
    }
  };

  // Handle updates to simulation sliders
  const handleSimProbabilityChange = (clName: string, val: number) => {
    const nextProb = { ...simulatedProbabilities, [clName]: val };
    
    // Normalize others so total probability approximates to 1 roughly
    const sumOthers = Object.keys(nextProb)
      .filter((k) => k !== clName)
      .reduce((sum, key) => sum + nextProb[key], 0);

    const rebalanceFactor = sumOthers > 0 ? (1.0 - val) / sumOthers : 0;
    
    Object.keys(nextProb).forEach((key) => {
      if (key !== clName) {
        nextProb[key] = Math.max(0, parseFloat((nextProb[key] * rebalanceFactor).toFixed(3)));
      }
    });

    setSimulatedProbabilities(nextProb);

    // Re-evaluate simulation prediction scores
    const simPredictions = simulatedClasses.map((cl) => ({
      className: cl,
      probability: nextProb[cl] || 0,
    }));
    setPredictions(simPredictions);
    evaluateActionRules(simPredictions);
  };

  const handleActionMappingChange = (clName: string, newAction: "NONE" | "JUMP" | "CROUCH") => {
    setClassMappings((prev) =>
      prev.map((m) => (m.className === clName ? { ...m, action: newAction } : m))
    );
  };

  const addCustomSimulationClass = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const newClass = (data.get("newClassName") as string || "").trim();
    if (newClass && !simulatedClasses.includes(newClass)) {
      const nextClasses = [...simulatedClasses, newClass];
      setSimulatedClasses(nextClasses);
      setSimulatedProbabilities((prev) => ({
        ...prev,
        [newClass]: 0.0,
      }));
      e.currentTarget.reset();
    }
  };

  const handleResetSimulation = () => {
    setSimulatedClasses(["Neutral / Still", "Raise Hands", "Crouch Move"]);
    setSimulatedProbabilities({
      "Neutral / Still": 0.90,
      "Raise Hands": 0.05,
      "Crouch Move": 0.05,
    });
  };

  return (
    <div className="flex flex-col gap-6 p-5 bg-[#111111] border-2 border-white shadow-[4px_4px_0_0_#ef4444] rounded-none w-full" id="teachable-machine-setup-workspacePanel">
      <div>
        <div className="flex items-center justify-between gap-1 border-b-2 border-zinc-800 pb-3" id="tm-control-header">
          <h2 className="text-xs font-mono font-black tracking-wide text-white flex items-center gap-2 uppercase">
            <Cpu className="text-[#ef4444] w-4 h-4 animate-spin-slow" />
            // TELEMETRY CONSOLE
          </h2>
          <span className="text-[9px] font-mono font-black text-white bg-red-600 px-2 py-0.5 uppercase">
            TM SENSORS
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-2.5 font-mono leading-relaxed">
          LINK EXTERNAL MODEL TELEMETRY OR TEST SYSTEMS LOCALLY VIA SIMULATED ENVIRONMENT POSTURES.
        </p>
      </div>

      {/* Mode Switches: REAL DEVICE/WEBCAM VS SIMULATION FOR TESTING */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-black border-2 border-zinc-800 rounded-none animate-fadeIn" id="tm-panel-mode-selector">
        <button
          onClick={() => {
            setUseSimulation(false);
            onActiveStateChange(loadingStatus === "READY");
          }}
          className={`py-1.5 px-3 rounded-none text-[10px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            !useSimulation
              ? "bg-[#ef4444] text-white font-black"
              : "text-zinc-500 hover:text-white"
          }`}
          id="btn-tm-real-control-mode"
        >
          <Camera className="w-3.5 h-3.5" />
          WEBCAM FEED
        </button>
        <button
          onClick={() => {
            setUseSimulation(true);
            onActiveStateChange(true);
          }}
          className={`py-1.5 px-3 rounded-none text-[10px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            useSimulation
              ? "bg-[#ef4444] text-white font-black"
              : "text-zinc-500 hover:text-white"
          }`}
          id="btn-tm-sim-control-mode"
        >
          <Sliders className="w-3.5 h-3.5" />
          SIMULATION SLIDERS
        </button>
      </div>

      {!useSimulation ? (
        /* Real connection view */
        <div className="flex flex-col gap-4 animate-fadeIn" id="real-tm-url-connector-box">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase font-bold">SELECT MODEL FORMAT</label>
            <div className="grid grid-cols-3 gap-2">
              {(["IMAGE", "POSE", "AUDIO"] as const).map((typeName) => (
                <button
                  key={typeName}
                  onClick={() => setModelType(typeName)}
                  className={`py-1 rounded-none text-[9px] font-mono font-black uppercase border-2 transition-all ${
                    modelType === typeName
                      ? "bg-white border-white text-black font-extrabold"
                      : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-white"
                  }`}
                  id={`btn-tm-model-type-${typeName}`}
                >
                  {typeName}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase font-black flex items-center justify-between">
              <span>TEACHABLE SHARED URL</span>
              <a
                href="https://teachablemachine.withgoogle.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[9px] text-[#ef4444] hover:underline flex items-center gap-1 font-bold"
                id="teachmachine-tutorial-outer-link"
              >
                CREATE MODEL
                <Link className="w-2.5 h-2.5" />
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelUrl}
                onChange={(e) => setModelUrl(e.target.value)}
                placeholder="https://teachablemachine.withgoogle.com/models/..."
                className="flex-1 bg-black border-2 border-zinc-800 rounded-none px-2.5 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-[#ef4444] font-mono"
                id="tm-model-sharelink-input"
              />
              <button
                onClick={handleLoadModel}
                disabled={loadingStatus === "LOADING_SCRIPTS" || loadingStatus === "LOADING_MODEL"}
                className="bg-white border-2 border-white hover:bg-zinc-200 text-black text-[10px] font-black uppercase px-4 rounded-none flex items-center gap-1.5 transition active:scale-95 flex-shrink-0"
                title="Assemble model"
                id="btn-tm-model-assemble"
              >
                {loadingStatus === "LOADING_SCRIPTS" || loadingStatus === "LOADING_MODEL" ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current text-black" />
                )}
                LINK
              </button>
            </div>
          </div>

          {/* Connection feedback statuses */}
          {loadingStatus === "READY" && (
            <div className="flex items-start gap-2.5 bg-zinc-950 border-2 border-white text-white p-3 rounded-none text-xs font-mono">
              <CheckCircle className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold uppercase text-[#ef4444] text-[11px]">TELEMETRY PIPELINE ACTIVE</p>
                <p className="text-[10px] text-zinc-400 mt-1">Classification stream synchronized with frame buffer.</p>
              </div>
            </div>
          )}

          {loadingStatus === "ERROR" && (
            <div className="flex items-start gap-2.5 bg-black border-2 border-[#ef4444] text-[#ef4444] p-3 rounded-none text-xs font-mono">
              <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold uppercase text-[11px]">CONNECTION EXCEPTION</p>
                <p className="text-[10px] text-zinc-400 mt-1 leading-normal uppercase">{errorMessage}</p>
              </div>
            </div>
          )}

          {loadingStatus !== "IDLE" && loadingStatus !== "ERROR" && loadingStatus !== "READY" && (
            <div className="flex items-center gap-3 bg-black p-3 rounded-none border-2 border-zinc-800">
              <RefreshCw className="w-4 h-4 text-[#ef4444] animate-spin" />
              <div className="text-xs">
                <span className="text-zinc-200 font-mono uppercase font-bold text-[10px] tracking-wider">
                  SYSTEM INITIALIZING: {loadingStatus.replace("_", " ")}
                </span>
                <p className="text-[9px] text-zinc-500 font-mono mt-0.5">ESTABLISHING PERMISSION LAYERS & LOADING LIBS...</p>
              </div>
            </div>
          )}

          {/* Real WebCam Feed Rendering */}
          {webcamActive && (modelType === "IMAGE" || modelType === "POSE") && (
            <div className="flex flex-col items-center justify-center p-3 bg-black rounded-none border-2 border-white animate-fadeIn">
              <span className="text-[10px] font-mono text-zinc-400 mb-2.5 uppercase flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-red-600 animate-pulse" />
                OPTICAL SENSORY BUFFER
              </span>
              <div ref={webcamContainerRef} className="overflow-hidden rounded-none border border-zinc-800 bg-zinc-900" style={{ minWidth: "200px", minHeight: "150px" }} />
            </div>
          )}

          {loadingStatus === "READY" && modelType === "AUDIO" && (
            <div className="p-3 bg-black rounded-none border-2 border-white flex flex-col items-center animate-fadeIn">
              <span className="text-[10px] font-mono text-white mb-2 uppercase flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-[#ef4444]" />
                DECIBEL HARMONIC SPECTROGRAM
              </span>
              <canvas ref={audioCanvasRef} className="block w-full h-12 rounded-none border border-zinc-800" width={220} height={48} />
            </div>
          )}
        </div>
      ) : (
        /* Simulation view */
        <div className="flex flex-col gap-4 animate-fadeIn" id="simulation-tm-playground">
          <div className="bg-black p-3.5 rounded-none border-2 border-zinc-800 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-[#ef4444] font-black flex items-center gap-1.5 uppercase">
                <Sparkles className="w-3.5 h-3.5 text-[#ef4444]" />
                PARAMETER REPLICA TESTBED
              </span>
              <button
                onClick={handleResetSimulation}
                className="text-[9px] font-mono text-zinc-500 uppercase hover:text-white transition-all font-bold"
                id="btn-tm-sim-reset"
              >
                [ RESET ALL ]
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono leading-relaxed mt-1">
              Drag manual sliders above the threshold to override game telemetry controls instantly!
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {simulatedClasses.map((clName) => {
              const currentProb = simulatedProbabilities[clName] || 0;
              const mapped = classMappings.find((m) => m.className === clName);
              const isTriggering = currentProb >= confidenceThreshold && (mapped?.action === "JUMP" || mapped?.action === "CROUCH");

              return (
                <div key={clName} className="flex flex-col gap-1 w-full bg-black p-3 rounded-none border border-zinc-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold text-zinc-300 truncate uppercase">
                      {clName}
                    </span>
                    <span className={`text-[10px] font-mono font-black ${isTriggering ? "text-[#ef4444]" : "text-zinc-500"}`}>
                      {(currentProb * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={currentProb}
                    onChange={(e) => handleSimProbabilityChange(clName, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-none appearance-none cursor-ew-resize accent-[#ef4444]"
                  />
                </div>
              );
            })}
          </div>

          <form onSubmit={addCustomSimulationClass} className="flex gap-2 bg-black p-2 rounded-none border-2 border-zinc-800">
            <input
              name="newClassName"
              type="text"
              placeholder="ADD SIMULATED TRIGGER..."
              className="flex-1 bg-transparent text-xs text-white font-mono border-none focus:outline-none placeholder-zinc-700 px-1 uppercase"
            />
            <button
              type="submit"
              className="bg-white hover:bg-zinc-200 text-black font-mono font-black uppercase px-3 py-1 text-[10px] rounded-none transition-colors"
              id="btn-tm-add-custom-simulation-class"
            >
              + ADD
            </button>
          </form>
        </div>
      )}

      {/* Class action mapping configuration */}
      {predictions.length > 0 || classMappings.length > 0 ? (
        <div className="flex flex-col gap-4 border-t-2 border-zinc-800 pt-4" id="tm-label-and-thresholds-container">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 uppercase">
              <label>CRITICAL SENSITIVITY LIMIT</label>
              <span className="text-white font-black font-mono">{(confidenceThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.01"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-black rounded-none appearance-none cursor-ew-resize accent-[#ef4444] border border-zinc-800"
            />
          </div>

          {/* Dynamic Map Actions Box */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase font-bold">// TARGET ROUTING AND TRIGGERS</label>
            <div className="flex flex-col gap-2">
              {classMappings.map((mapping) => {
                const liveProb = predictions.find((p) => p.className === mapping.className)?.probability || 0;
                const isTripping = liveProb >= confidenceThreshold;

                return (
                  <div
                    key={mapping.className}
                    className={`flex items-center justify-between gap-3 p-2.5 bg-black rounded-none border-2 transition-all duration-150 ${
                      isTripping 
                        ? mapping.action === "JUMP"
                          ? "border-[#ef4444]/80 bg-red-950/20"
                          : mapping.action === "CROUCH"
                            ? "border-white bg-[#ef4444]/20"
                            : "border-red-600"
                        : "border-zinc-850"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1 bg-zinc-950 px-1 py-0.5">
                        <span className="text-xs text-white truncate max-w-[120px] font-semibold uppercase font-mono">
                          {mapping.className}
                        </span>
                        <span className="font-mono text-[9px] font-black text-[#ef4444]">
                          {(liveProb * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-900 rounded-none overflow-hidden border border-zinc-850">
                        <div
                          className={`h-full rounded-none transition-all duration-75 ${
                            isTripping
                              ? mapping.action === "JUMP"
                                ? "bg-[#ef4444]"
                                : mapping.action === "CROUCH"
                                  ? "bg-white"
                                  : "bg-red-500"
                              : "bg-zinc-700"
                          }`}
                          style={{ width: `${liveProb * 100}%` }}
                        />
                      </div>
                    </div>

                    <select
                      value={mapping.action}
                      onChange={(e) =>
                        handleActionMappingChange(mapping.className, e.target.value as ModelClassMapping["action"])
                      }
                      className="bg-black border-2 border-zinc-800 select-action-mappings text-[10px] text-white font-mono py-1.5 px-2 rounded-none focus:outline-none focus:border-[#ef4444]"
                      title="Route mapping"
                    >
                      <option value="NONE">- IGNORE -</option>
                      <option value="JUMP">🦾 [JUMP]</option>
                      <option value="CROUCH">🦿 [CROUCH]</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-black rounded-none border-2 border-zinc-800 text-center">
          <p className="text-[10px] text-zinc-500 font-mono uppercase">
            No active telemetry classes. Insert URL or slide playground parameters.
          </p>
        </div>
      )}
    </div>
  );
}
