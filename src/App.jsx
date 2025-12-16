import { useState, useRef, useEffect } from "react";
import {
  Send,
  Plus,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pollingInterval = useRef(null);

  const API_URL =
    "https://ai-resume-analysis-backend-production.up.railway.app";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    const clearBackend = async () => {
      try {
        await fetch(`${API_URL}/clear`, { method: "DELETE" });
        console.log("Backend cleared on load");
      } catch (error) {
        console.error("Clear error:", error);
      }
    };
    clearBackend();
  }, []);


  const pollAnalysis = () => {
    let attempts = 0;
    const maxAttempts = 60;

    pollingInterval.current = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${API_URL}/status`);
        const data = await response.json();

        if (data.analysis_ready) {
          clearInterval(pollingInterval.current);
          setProcessing(false);
          toast.success(
            "Resume processed! Click 'Analyze Resume' to view results.",
            {
              position: "top-right",
              autoClose: 3000,
            }
          );
        } else if (attempts >= maxAttempts) {
          clearInterval(pollingInterval.current);
          setProcessing(false);
          toast.error("Processing timeout. Please try again.", {
            position: "top-right",
            autoClose: 4000,
          });
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed!", {
        position: "top-right",
        autoClose: 3000,
      });
      return;
    }

  
    if (file.size > 1048576) {
      toast.error("File size must be less than 1MB!", {
        position: "top-right",
        autoClose: 3000,
      });
      return;
    }

    await fetch(`${API_URL}/clear`, { method: "DELETE" });

    setUploading(true);
    setAnalysis(null);
    setShowAnalysis(false);
    setMessages([]);
    setUploadedFile(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      setUploadedFile(file.name);

      toast.success(`${file.name} uploaded successfully!`, {
        position: "top-right",
        autoClose: 2000,
      });

      setUploading(false);
      setProcessing(true);
      toast.info("Processing resume...", {
        position: "top-right",
        autoClose: 2000,
      });

      pollAnalysis();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed. Please try again.", {
        position: "top-right",
        autoClose: 3000,
      });
      setUploading(false);
      setProcessing(false);
    } finally {
      fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    try {
      const response = await fetch(`${API_URL}/analysis`);
      const data = await response.json();

      if (data.status === "complete") {
        setAnalysis(data.analysis);
        setShowAnalysis(true);
        toast.success("Analysis loaded!", {
          position: "top-right",
          autoClose: 2000,
        });
      } else {
        toast.info("Analysis still processing...", {
          position: "top-right",
          autoClose: 2000,
        });
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to load analysis.", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  const parseJobsResponse = (jobsText) => {
    const jobMatches = jobsText.match(/Job \d+:[\s\S]*?(?=Job \d+:|$)/g);
    if (!jobMatches) return [jobsText];

    return jobMatches.map((job) => {
      const lines = job.split("\n").filter((line) => line.trim());
      let formatted = "";
      let applyLink = "";

      lines.forEach((line) => {
        const cleanLine = line.replace(/\*\*/g, "").trim();

        if (cleanLine.startsWith("Job")) {
          formatted += `${cleanLine}\n\n`;
        } else if (cleanLine.includes("Title:")) {
          formatted += `📋 ${cleanLine}\n`;
        } else if (cleanLine.includes("Company:")) {
          formatted += `🏢 ${cleanLine}\n`;
        } else if (cleanLine.includes("Location:")) {
          formatted += `📍 ${cleanLine}\n`;
        } else if (
          cleanLine.includes("Apply Link:") ||
          cleanLine.includes("https://") ||
          cleanLine.includes("http://")
        ) {
          const urlMatch = cleanLine.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            applyLink = urlMatch[1];
          }
        }
        
      });

      
      if (applyLink) {
        formatted += `\n🔗 ${applyLink}`;
      }

      return formatted.trim();
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();


      const isJobResponse =
        data.answer.includes("Job 1:") ||
        data.answer.includes("Title:") ||
        data.answer.includes("Company:");

      if (isJobResponse) {
        const jobs = parseJobsResponse(data.answer);

        for (let i = 0; i < jobs.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));


          const applyMatch = data.answer.match(
            /Apply Link:\s*(https?:\/\/[^\s\n]+)/
          );
          const applyUrl = applyMatch ? applyMatch[1] : null;

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: jobs[i],
              applyUrl: applyUrl,
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer },
        ]);
      }
    } catch (error) {
      toast.error("Failed to get response. Please try again.", {
        position: "top-right",
        autoClose: 3000,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  const getScoreColor = (score) => {
    if (score >= 75) return "text-green-500 border-green-500";
    if (score >= 50) return "text-yellow-500 border-yellow-500";
    return "text-red-500 border-red-500";
  };

  const getScorePercentage = (score) => {
    const circumference = 2 * Math.PI * 45;
    return circumference - (score / 100) * circumference;
  };

  const isDisabled = uploading || processing;

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                AI Resume Analyzer
              </h1>
              <p className="text-xs text-gray-600">
                Upload your resume to get ATS score and job suggestions
              </p>
            </div>
          </div>
        </div>
      </header>

      
      {(uploading || processing) && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-4 mx-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <div>
                <span className="text-sm font-medium text-gray-900 block">
                  {uploading
                    ? "Uploading resume..."
                    : "Processing & analyzing..."}
                </span>
                <span className="text-xs text-gray-600">
                  {uploading ? "Please wait" : "This may take a moment"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pt-28 pb-32">
        {!uploadedFile ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-24 h-24 rounded-2xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg">
              <Upload className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Upload Your Resume
            </h2>
            <p className="text-gray-600 max-w-md mb-8">
              Get instant ATS score, personalized suggestions, and relevant job
              recommendations
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
              className="px-8 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 hover:shadow-lg transition-all duration-200 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-5 h-5" />
              Choose Resume (PDF)
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf"
              className="hidden"
            />
          </div>
        ) : !showAnalysis ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Resume Uploaded!
            </h2>
            <p className="text-gray-600 mb-8">{uploadedFile}</p>
            <button
              onClick={handleAnalyze}
              disabled={processing}
              className="px-8 py-4 bg-blue-600 hover:cursor-pointer text-white rounded-xl font-semibold hover:bg-blue-700 hover:shadow-lg transition-all duration-200 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Analyze Resume
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* ATS Score Circle */}
            {analysis && (
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Score Circle */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-32 h-32">
                      <svg className="transform -rotate-90 w-32 h-32">
                        <circle
                          cx="64"
                          cy="64"
                          r="45"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-gray-200"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="45"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 45}
                          strokeDashoffset={getScorePercentage(
                            analysis.ats_score
                          )}
                          className={`${getScoreColor(
                            analysis.ats_score
                          )} transition-all duration-1000`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={`text-3xl font-bold ${getScoreColor(
                            analysis.ats_score
                          )}`}
                        >
                          {analysis.ats_score}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-3 font-medium">
                      ATS Score
                    </p>
                    {analysis.primary_role && (
                      <p className="text-xs text-gray-500 mt-1">
                        {analysis.primary_role}
                      </p>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                      Summary
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      {analysis.summary}
                    </p>
                  </div>
                </div>

                {analysis.missing_skills &&
                  analysis.missing_skills.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-3">
                        Missing Skills
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {analysis.missing_skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {analysis.suggestions && analysis.suggestions.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                      Top Suggestions
                    </h3>
                    <ul className="space-y-2">
                      {analysis.suggestions
                        .slice(0, 5)
                        .map((suggestion, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-gray-700"
                          >
                            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{suggestion}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {messages.length > 0 && (
              <div className="space-y-4">
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-6 py-4 ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-900 border border-gray-200"
                      }`}
                    >
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.content.split("\n").map((line, i) => {
                          const urlMatch = line.match(/(https?:\/\/[^\s\)]+)/);
                          if (urlMatch) {
                            const url = urlMatch[1];
                            return (
                              <div key={i} className="mb-1">
                                🔗{" "}
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-700 underline"
                                >
                                  Apply Here
                                </a>
                              </div>
                            );
                          }
                          return (
                            <div key={i} className="mb-1">
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl px-6 py-4 border border-gray-200">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-sm text-gray-600">
                          Thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}
      </main>

      {showAnalysis && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 to-transparent pt-8 pb-6">
          <div className="max-w-6xl mx-auto px-6">
            <form onSubmit={handleSubmit}>
              <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDisabled}
                  className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 hover:cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Upload New Resume"
                >
                  <Upload className="w-5 h-5 text-blue-600" />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your resume or search for jobs..."
                  disabled={loading}
                  className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-500 px-2 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
