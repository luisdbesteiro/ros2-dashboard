import "./App.css";

import RosStatus from "./components/RosStatus";
import { RosProvider, useRos } from "./providers/RosProvider";

import CmdVelJoystick from "./components/CmdVelJoystick";
import MapOdomViewer from "./components/MapOdomViewer";
import CameraViewer from "./components/CameraViewer";
import BatteryWidget from "./components/BatteryState";
import ObstacleViewer3D from "./components/ObstacleViewer3D";

function AppContent() {

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">⌖</div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">ROS Dashboard</span>
              <span className="sidebar-brand-subtitle">Control + estado</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Status</span>
            </div>
            <RosStatus />
            <BatteryWidget />
          </div>

          <div className="sidebar-section sidebar-section-grow">
            <div className="sidebar-section-header">
              <span>Joystick</span>
            </div>
            <div className="sidebar-joystick-wrap">
              <CmdVelJoystick />
            </div>
          </div>
        </div>
      </aside>

      <main className="app-workspace">
        <div className="workspace-header">
          <div>
            <h1 className="workspace-title">Widgets</h1>
            <p className="workspace-subtitle">
              Visualización y control en tiempo real
            </p>
          </div>
        </div>

        <div className="widgets-grid">
          <section className="widget-slot">
            <ObstacleViewer3D
              pointCloudTopic="/velodyne_points"
              maxPoints={10000}
              maxRange={18}
              pointSize={0.1}
            />
          </section>

          <section className="widget-slot">
            <CameraViewer
              containerStyle={{ width: "100%" }}
              canvasStyle={{ width: "100%", height: "auto" }}
            />
          </section>
              
          <section className="widget-slot widget-slot-wide">
            <MapOdomViewer
              containerStyle={{ width: "100%" }}
              canvasStyle={{ width: "100%", height: "auto" }}
            />
          </section>

        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <RosProvider>
      <AppContent />
    </RosProvider>
  );
}

export default App;