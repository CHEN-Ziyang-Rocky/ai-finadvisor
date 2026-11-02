import {
  RouterProvider,
} from "react-router-dom";
import router from './router'
import ProjectLinks from './components/ProjectLinks'

function App() {
  return (
    <div className="App">
      <ProjectLinks />
      <RouterProvider router={router} />
    </div>
  );
}

export default App;
