import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ScenePage } from "./pages/ScenePage";

const isSpatialRuntime = __XR_ENV_BASE__.startsWith("/webspatial/avp");

export default function App() {
  return (
    <Router basename={__XR_ENV_BASE__}>
      <Routes>
        <Route index element={isSpatialRuntime ? <ScenePage /> : <HomePage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="scene" element={<ScenePage />} />
      </Routes>
    </Router>
  );
}
