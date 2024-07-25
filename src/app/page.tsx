import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <form className="w-full mt-4 lg:w-1/2" method="GET" action="/league">
          <label>To get started, enter your ESPN Fantasy Football league ID and click 'Submit'.</label>
          <input className="w-full h-12 p-2 mt-4 text-black bg-white border border-gray-300 rounded-lg" type="text" name="leagueID"/>
          <button type="submit" className="w-full p-2 mt-4 text-white bg-black border border-gray-300 rounded-lg">Submit</button>
        </form>
      </div>
    </main>
  );
}
