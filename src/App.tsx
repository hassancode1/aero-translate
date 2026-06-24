import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { Home } from "./routes/Home";
import { StaffPage } from "./routes/StaffPage";
import { PassengerPage } from "./routes/PassengerPage";

// pitchdeck.html is a standalone static file (also used to print the PDF
// version), not a React page. Embedding it in an iframe — rather than
// redirecting the browser to it — keeps the address bar on /pitchdeck
// instead of flipping to /pitchdeck.html.
function PitchDeck() {
  return <iframe src="/pitchdeck.html" title="AeroTranslate Pitch Deck" className="w-screen h-screen border-none block" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo" element={<Home />} />
        <Route path="/staff/:code" element={<StaffPage />} />
        <Route path="/passenger/:code" element={<PassengerPage />} />
        <Route path="/pitchdeck" element={<PitchDeck />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
