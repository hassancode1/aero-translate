import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { Home } from "./routes/Home";
import { StaffPage } from "./routes/StaffPage";
import { PassengerPage } from "./routes/PassengerPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo" element={<Home />} />
        <Route path="/staff/:code" element={<StaffPage />} />
        <Route path="/passenger/:code" element={<PassengerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
