import { createContext, useContext, useEffect, useState } from "react";
import { parseRoute } from "../utils/api";

const RouterContext = createContext(null);

export function RouterProvider({ children }) {
  const [route, setRoute] = useState(() => parseRoute());
  const [activeClassId, setActiveClassId] = useState(null);
  const [pageTransition, setPageTransition] = useState("page-enter");

  // Page transition animation
  useEffect(() => {
    setPageTransition("page-enter");
    const id = requestAnimationFrame(() =>
      setPageTransition("page-enter page-enter-active")
    );
    return () => cancelAnimationFrame(id);
  }, [route.page, route.classId, route.lessonId, route.studentId]);

  // Browser back/forward
  useEffect(() => {
    const handlePopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync activeClassId from route
  useEffect(() => {
    if (route.classId) setActiveClassId(route.classId);
  }, [route.classId]);

  function navigateToClasses() {
    window.history.pushState({}, "", "/classes");
    setRoute({ page: "classes", classId: null, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToClass(id) {
    window.history.pushState({}, "", `/classes/${id}`);
    setRoute({ page: "class", classId: id, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToLesson(classId, lessonId) {
    window.history.pushState({}, "", `/classes/${classId}/lessons/${lessonId}`);
    setRoute({ page: "lesson", classId, lessonId, itemId: null, studentId: null });
  }

  function navigateToStudent(classId, studentId) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}`);
    setRoute({ page: "student", classId, studentId, lessonId: null });
  }

  function navigateToPractice(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/practice/${itemId}`);
    setRoute({ page: "practice", classId, itemId, lessonId: null, studentId: null });
  }

  function navigateToQuiz(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/quiz/${itemId}`);
    setRoute({ page: "quiz", classId, itemId, lessonId: null, studentId: null });
  }

  function navigateToLearningItem(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/learn/${itemId}`);
    setRoute({ page: "learn", classId, itemId, lessonId: null, studentId: null });
  }

  function navigateToStudentStats(classId, studentId) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/stats`);
    setRoute({ page: "student-stats", classId, studentId, lessonId: null, itemId: null });
  }

  function navigateToAILog(classId, studentId, itemKey, itemLabel, itemType) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/ai-log`);
    setRoute({ page: "ai-log", classId, studentId, itemKey, itemLabel, itemType, lessonId: null, itemId: null });
  }

  function navigateToItemResponse(classId, studentId) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/response`);
    setRoute({ page: "item-response", classId, studentId, lessonId: null, itemId: null });
  }

  function navigateToMyDashboard(classId) {
    window.history.pushState({}, "", `/classes/${classId}/my-dashboard`);
    setRoute({ page: "dashboard", classId, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToItem(classId, navItem) {
    if (!navItem) return;
    if (navItem.type === "practice") navigateToPractice(classId, navItem.id);
    else if (navItem.type === "quiz") navigateToQuiz(classId, navItem.id);
    else navigateToLearningItem(classId, navItem.id);
  }

  function navigateToHub() {
    window.history.pushState({}, "", "/hub");
    setRoute({ page: "hub", classId: null, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToHubPreview(templateId) {
    window.history.pushState({}, "", `/hub/${templateId}/preview`);
    setRoute({ page: "hub-preview", templateId, classId: null, lessonId: null, itemId: null, studentId: null });
  }

  return (
    <RouterContext.Provider value={{
      route, setRoute,
      activeClassId, setActiveClassId,
      pageTransition,
      navigateToClasses,
      navigateToClass,
      navigateToLesson,
      navigateToStudent,
      navigateToPractice,
      navigateToQuiz,
      navigateToLearningItem,
      navigateToStudentStats,
      navigateToAILog,
      navigateToItemResponse,
      navigateToMyDashboard,
      navigateToItem,
      navigateToHub,
      navigateToHubPreview,
    }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  return useContext(RouterContext);
}
