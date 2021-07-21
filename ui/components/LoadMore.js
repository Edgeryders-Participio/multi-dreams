import HappySpinner from "components/HappySpinner";
import { CheveronDownIcon } from "components/Icons";

const LoadMore = ({ moreExist, loading, reverse, onClick }) => {
  return (
    <div className="mt-7">
      {loading ? (
        <div className="flex-grow flex justify-center items-center">
          <HappySpinner />
        </div>
      ) : moreExist ? (
        <button
          className="hover:bg-gray-300 p-1 m-auto h-full rounded flex justify-center items-center focus:outline-none opacity-75"
          onClick={onClick}
        >
          <div>Load more</div>
          <CheveronDownIcon
            className={`h-8 w-8 ml-3 p-1 text-gray-900 bg-gray-100 rounded-full ${
              reverse ? "transform rotate-180" : ""
            }`}
          />
        </button>
      ) : null}
    </div>
  );
};

export default LoadMore;
